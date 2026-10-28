from sqlalchemy import and_, exists, select
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.core.permissions import Role
from app.db.models import CustomerPropertyLink, Property, User, UserPropertyAccess


def get_allowed_property_ids(db: Session, user: User) -> set[str]:
    if user.role == Role.ADMIN:
        return set(db.scalars(select(Property.id)).all())

    assigned = db.scalars(
        select(UserPropertyAccess.property_id).where(UserPropertyAccess.user_id == user.id)
    ).all()
    return set(assigned)


def resolve_property_scope(
    db: Session,
    user: User,
    header_property_id: str | None = None,
) -> set[str]:
    allowed_ids = get_allowed_property_ids(db, user)

    if header_property_id:
        prop_exists = db.scalar(select(Property.id).where(Property.id == header_property_id))
        if not prop_exists:
            raise ForbiddenError("Invalid or forbidden property scope")
        if user.role != Role.ADMIN and header_property_id not in allowed_ids:
            raise ForbiddenError("X-Property-Id is out of authorized scope")
        return {header_property_id}

    return allowed_ids


class ScopedQuery:
    @staticmethod
    def get_scoped_property(db: Session, user: User, property_id: str) -> Property:
        if property_id not in get_allowed_property_ids(db, user):
            raise NotFoundError("Property not found")

        prop = db.scalar(select(Property).where(Property.id == property_id))
        if not prop:
            raise NotFoundError("Property not found")
        return prop

    @staticmethod
    def get_scoped_user(db: Session, current_user: User, target_user_id: str) -> User:
        target = db.scalar(select(User).where(User.id == target_user_id))
        if not target:
            raise NotFoundError("User not found")
        if current_user.role == Role.ADMIN:
            return target

        allowed_properties = get_allowed_property_ids(db, current_user)
        if not allowed_properties:
            raise NotFoundError("User not found")

        linked_customer = db.scalar(
            select(CustomerPropertyLink.id).where(
                and_(
                    CustomerPropertyLink.user_id == target_user_id,
                    target.role == Role.CUSTOMER,
                    CustomerPropertyLink.property_id.in_(allowed_properties),
                )
            )
        )
        if linked_customer:
            return target
        raise NotFoundError("User not found")

    @staticmethod
    def list_scoped_users(
        db: Session,
        current_user: User,
        effective_scope: set[str],
        role_filter: str | None = None,
        customer_persona_filter: str | None = None,
        segment_filter: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[User], int]:
        if current_user.role == Role.STAFF and not effective_scope:
            return [], 0

        query = select(User)
        if segment_filter == "registered_no_booking":
            if current_user.role != Role.ADMIN:
                raise ForbiddenError("Segment 'registered_no_booking' is restricted to Admin")
            query = query.where(
                and_(
                    User.role == Role.CUSTOMER,
                    ~exists(select(1).where(CustomerPropertyLink.user_id == User.id)),
                )
            )
        elif current_user.role != Role.ADMIN:
            query = query.where(
                User.role == Role.CUSTOMER,
                User.id.in_(
                    select(CustomerPropertyLink.user_id).where(
                        CustomerPropertyLink.property_id.in_(effective_scope)
                    )
                )
            )
        else:
            all_properties = set(db.scalars(select(Property.id)).all())
            if effective_scope != all_properties:
                query = query.where(
                    User.id.in_(
                        select(CustomerPropertyLink.user_id)
                        .where(CustomerPropertyLink.property_id.in_(effective_scope))
                        .union(
                            select(UserPropertyAccess.user_id).where(
                                UserPropertyAccess.property_id.in_(effective_scope)
                            )
                        )
                    )
                )

        if role_filter:
            query = query.where(User.role == role_filter)
        if customer_persona_filter:
            query = query.where(
                User.role == Role.CUSTOMER,
                User.customer_persona == customer_persona_filter,
            )
        if search:
            search_term = f"%{search}%"
            query = query.where(
                (User.email.ilike(search_term))
                | (User.username.ilike(search_term))
                | (User.full_name.ilike(search_term))
            )

        total_count = len(db.scalars(query).all())
        users = db.scalars(
            query.order_by(User.created_at.desc()).offset(offset).limit(limit)
        ).all()
        return list(users), total_count
