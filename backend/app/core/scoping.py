from sqlalchemy import and_, exists, select
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.core.permissions import AccountType
from app.db.models import CustomerPropertyLink, Property, User, UserPropertyAccess


def get_allowed_property_ids(db: Session, user: User) -> set[str]:
    """
    Returns the set of all property IDs this user is authorized to access.
    Super Admins have access to all active properties.
    Managers & Staff have access to their explicitly assigned properties.
    """
    if user.account_type == AccountType.SUPER_ADMIN:
        all_props = db.scalars(select(Property.id)).all()
        return set(all_props)
    
    assigned = db.scalars(
        select(UserPropertyAccess.property_id).where(UserPropertyAccess.user_id == user.id)
    ).all()
    return set(assigned)

def resolve_property_scope(
    db: Session,
    user: User,
    header_property_id: str | None = None,
) -> set[str]:
    """
    Resolves the effective property scope for an admin request.
    If X-Property-Id is passed:
      - Validates that the property exists.
      - Checks that it is within the user's allowed set. If not, raises 403 Forbidden.
      - Returns {header_property_id}.
    If X-Property-Id is omitted:
      - Returns all allowed property IDs for this user.
    """
    allowed_ids = get_allowed_property_ids(db, user)
    
    if header_property_id:
        # Check existence first
        prop_exists = db.scalar(select(Property.id).where(Property.id == header_property_id))
        if not prop_exists:
            # Check if user is super admin or if this is an invalid ID
            raise ForbiddenError("Invalid or forbidden property scope")
            
        if user.account_type != AccountType.SUPER_ADMIN:
            if header_property_id not in allowed_ids:
                raise ForbiddenError("X-Property-Id is out of authorized scope")
        return {header_property_id}

    return allowed_ids

class ScopedQuery:
    """
    Centralized scoped query helper enforcing tenant and property isolation.
    Admin routes must use ScopedQuery rather than building ad hoc queries.
    """
    @staticmethod
    def get_scoped_property(db: Session, user: User, property_id: str) -> Property:
        allowed = get_allowed_property_ids(db, user)
        if property_id not in allowed:
            # Return 404 to avoid leaking existence
            raise NotFoundError("Property not found")
        
        prop = db.scalar(select(Property).where(Property.id == property_id))
        if not prop:
            raise NotFoundError("Property not found")
        return prop

    @staticmethod
    def get_scoped_user(db: Session, current_user: User, target_user_id: str) -> User:
        """
        Retrieves a user only if they are within current_user's scope.
        Out-of-scope returns 404 to avoid leaking existence.
        """
        target = db.scalar(select(User).where(User.id == target_user_id))
        if not target:
            raise NotFoundError("User not found")
            
        if current_user.account_type == AccountType.SUPER_ADMIN:
            return target
            
        # Target is customer or staff
        allowed_properties = get_allowed_property_ids(db, current_user)
        
        # Check if customer is linked to one of allowed properties
        is_linked_customer = db.scalar(
            select(CustomerPropertyLink.id).where(
                and_(
                    CustomerPropertyLink.user_id == target_user_id,
                    CustomerPropertyLink.property_id.in_(allowed_properties)
                )
            )
        )
        if is_linked_customer:
            return target
            
        # Check if staff member shares an allowed property
        is_shared_staff = db.scalar(
            select(UserPropertyAccess.id).where(
                and_(
                    UserPropertyAccess.user_id == target_user_id,
                    UserPropertyAccess.property_id.in_(allowed_properties)
                )
            )
        )
        if is_shared_staff:
            return target
            
        # If neither, return 404 (out-of-scope resource returns 404, not 403)
        raise NotFoundError("User not found")

    @staticmethod
    def list_scoped_users(
        db: Session,
        current_user: User,
        effective_scope: set[str],
        account_type_filter: str | None = None,
        segment_filter: str | None = None, # e.g. "registered_no_booking"
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[User], int]:
        """
        Lists users scoped to the current user's authorized properties.
        Visibility of customers:
        - Manager and Staff see ONLY customers linked to their allowed properties.
        - Customers with no property link ("unassigned pool") are visible to SUPER_ADMIN only.
        """
        query = select(User)
        
        # Segment filter: "registered_no_booking"
        if segment_filter == "registered_no_booking":
            if current_user.account_type != AccountType.SUPER_ADMIN:
                raise ForbiddenError("Segment 'registered_no_booking' is restricted to Super Admin only")
            # Has no property links and is a customer
            query = query.where(
                and_(
                    User.account_type.in_([
                        AccountType.HOTEL_GUEST,
                        AccountType.SHORT_TERM_HOSTEL_GUEST,
                        AccountType.LONG_TERM_RESIDENT,
                    ]),
                    ~exists(select(1).where(CustomerPropertyLink.user_id == User.id))
                )
            )
        else:
            if current_user.account_type == AccountType.SUPER_ADMIN:
                # If specific scope selected via X-Property-Id:
                all_props = set(db.scalars(select(Property.id)).all())
                if effective_scope and len(effective_scope) < len(all_props):
                    query = query.where(
                        User.id.in_(
                            select(CustomerPropertyLink.user_id).where(
                                CustomerPropertyLink.property_id.in_(effective_scope)
                            ).union(
                                select(UserPropertyAccess.user_id).where(
                                    UserPropertyAccess.property_id.in_(effective_scope)
                                )
                            )
                        )
                    )
            else:
                # Non-super admin:
                # MUST be either staff assigned to allowed properties OR customer linked to allowed properties
                query = query.where(
                    User.id.in_(
                        select(CustomerPropertyLink.user_id).where(
                            CustomerPropertyLink.property_id.in_(effective_scope)
                        ).union(
                            select(UserPropertyAccess.user_id).where(
                                UserPropertyAccess.property_id.in_(effective_scope)
                            )
                        )
                    )
                )

        if account_type_filter:
            query = query.where(User.account_type == account_type_filter)

        if search:
            search_term = f"%{search}%"
            query = query.where(
                (User.email.ilike(search_term)) |
                (User.username.ilike(search_term)) |
                (User.full_name.ilike(search_term))
            )

        total_count = len(db.scalars(query).all())
        users = db.scalars(query.order_by(User.created_at.desc()).offset(offset).limit(limit)).all()
        return list(users), total_count
