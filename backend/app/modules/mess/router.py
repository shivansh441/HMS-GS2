from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role
from app.db.models import (
    MealItem,
    MessFacility,
    MessMenuSchedule,
    Property,
    User,
)
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.mess.schemas import (
    MealItemCreateRequest,
    MealItemResponse,
    MealItemUpdateRequest,
    MenuItemResponse,
    MenuScheduleRequest,
    MenuScheduleResponse,
    MessFacilityCreateRequest,
    MessFacilityResponse,
    MessFacilityUpdateRequest,
)

mess_router = APIRouter(prefix="/mess", tags=["Mess Management"])
HOSTEL_TYPES = {"HOSTEL_BOYS", "HOSTEL_GIRLS", "HOSTEL_COED"}


def _require_admin(actor: User) -> None:
    if actor.role != Role.ADMIN:
        raise ForbiddenError("Only admins can manage mess facilities and menus")


def _scoped_property(
    db: Session, property_id: str, property_scope: set[str]
) -> Property:
    if property_id not in property_scope:
        raise NotFoundError("Property not found")
    prop = db.scalar(
        select(Property).where(
            Property.id == property_id,
            Property.is_deleted.is_(False),
        )
    )
    if not prop:
        raise NotFoundError("Property not found")
    return prop


def _get_facility(
    db: Session, mess_id: int, property_scope: set[str]
) -> MessFacility:
    facility = db.scalar(
        select(MessFacility)
        .options(joinedload(MessFacility.property))
        .where(MessFacility.id == mess_id)
    )
    if not facility or facility.property_id not in property_scope:
        raise NotFoundError("Mess facility not found")
    return facility


def _facility_response(facility: MessFacility) -> MessFacilityResponse:
    return MessFacilityResponse(
        id=facility.id,
        propertyId=facility.property_id,
        propertyName=facility.property.name,
        propertyType=facility.property.type,
        name=facility.name,
        isDefault=facility.is_default,
        capacity=facility.capacity,
        createdAt=facility.created_at,
    )


def _meal_response(meal: MealItem) -> MealItemResponse:
    return MealItemResponse(
        id=meal.id,
        name=meal.name,
        category=meal.category,
        dietaryType=meal.dietary_type,
        ingredients=meal.ingredients,
        createdAt=meal.created_at,
    )


@mess_router.get("/facilities", response_model=list[MessFacilityResponse])
def list_mess_facilities(
    property_id: str | None = Query(default=None, alias="propertyId"),
    property_id_snake: str | None = Query(default=None, alias="property_id"),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    if property_id and property_id_snake and property_id != property_id_snake:
        raise BadRequestError("propertyId and property_id must identify the same property")
    property_id = property_id or property_id_snake
    if property_id:
        _scoped_property(db, property_id, property_scope)
        scope = {property_id}
    else:
        scope = property_scope
    if not scope:
        return []
    facilities = db.scalars(
        select(MessFacility)
        .options(joinedload(MessFacility.property))
        .where(MessFacility.property_id.in_(scope))
        .where(
            Property.is_deleted.is_(False),
            Property.type.in_(HOSTEL_TYPES),
        )
        .order_by(Property.name, MessFacility.is_default.desc(), MessFacility.name)
        .join(Property, Property.id == MessFacility.property_id)
    ).all()
    return [_facility_response(facility) for facility in facilities]


@mess_router.post("/facilities", response_model=MessFacilityResponse, status_code=201)
def create_mess_facility(
    payload: MessFacilityCreateRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    prop = _scoped_property(db, payload.property_id, property_scope)
    if not prop.has_mess_facility or prop.type not in HOSTEL_TYPES:
        raise BadRequestError("Enable mess management on a hostel property first")

    db.scalar(select(Property).where(Property.id == prop.id).with_for_update())
    existing = db.scalars(
        select(MessFacility).where(MessFacility.property_id == prop.id)
    ).all()
    has_default = any(item.is_default for item in existing)
    facility = MessFacility(
        property_id=prop.id,
        name=payload.name,
        capacity=payload.capacity,
        is_default=payload.is_default or not has_default,
    )
    try:
        if facility.is_default:
            for current in existing:
                current.is_default = False
        db.add(facility)
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError("Unable to set the property's default mess", code="MESS_DEFAULT_CONFLICT") from error
    db.commit()
    db.refresh(facility)
    facility.property = prop
    return _facility_response(facility)


@mess_router.put("/facilities/{mess_id}", response_model=MessFacilityResponse)
def update_mess_facility(
    mess_id: int,
    payload: MessFacilityUpdateRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    facility = _get_facility(db, mess_id, property_scope)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        facility.name = changes["name"]
    if "capacity" in changes:
        facility.capacity = changes["capacity"]
    if changes.get("is_default") is True:
        db.scalar(select(Property).where(Property.id == facility.property_id).with_for_update())
        siblings = db.scalars(
            select(MessFacility).where(
                MessFacility.property_id == facility.property_id,
                MessFacility.id != facility.id,
                MessFacility.is_default.is_(True),
            )
        ).all()
        for sibling in siblings:
            sibling.is_default = False
        if siblings:
            db.flush()
        facility.is_default = True
    elif changes.get("is_default") is False and facility.is_default:
        raise ConflictError("A property with mess management must keep one default facility")
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError("Unable to set the property's default mess", code="MESS_DEFAULT_CONFLICT") from error
    db.commit()
    db.refresh(facility)
    return _facility_response(facility)


@mess_router.delete("/facilities/{mess_id}", status_code=204)
def delete_mess_facility(
    mess_id: int,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    facility = _get_facility(db, mess_id, property_scope)
    siblings = db.scalars(
        select(MessFacility)
        .where(
            MessFacility.property_id == facility.property_id,
            MessFacility.id != facility.id,
        )
        .order_by(MessFacility.id)
    ).all()
    if facility.is_default and not siblings and facility.property.has_mess_facility:
        raise ConflictError("Create another mess facility or disable mess management before deleting the default")
    if facility.is_default and siblings:
        facility.is_default = False
        db.flush()
        siblings[0].is_default = True
    db.delete(facility)
    db.commit()
    return None


@mess_router.get("/meals", response_model=list[MealItemResponse])
def list_meals(
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    meals = db.scalars(
        select(MealItem).order_by(MealItem.category, MealItem.name, MealItem.id)
    ).all()
    return [_meal_response(meal) for meal in meals]


@mess_router.post("/meals", response_model=MealItemResponse, status_code=201)
def create_meal(
    payload: MealItemCreateRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    meal = MealItem(
        name=payload.name,
        category=payload.category.value,
        dietary_type=payload.dietary_type.value,
        ingredients=payload.ingredients,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return _meal_response(meal)


@mess_router.put("/meals/{meal_id}", response_model=MealItemResponse)
def update_meal(
    meal_id: int,
    payload: MealItemUpdateRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    meal = db.get(MealItem, meal_id)
    if not meal:
        raise NotFoundError("Meal item not found")
    changes = payload.model_dump(exclude_unset=True)
    if any(
        field in changes and changes[field] is None
        for field in ("name", "category", "dietary_type")
    ):
        raise BadRequestError("Meal name, category, and dietary type cannot be null")
    for field, value in changes.items():
        if field == "category" and value is not None:
            value = value.value
        elif field == "dietary_type" and value is not None:
            value = value.value
        setattr(meal, field, value)
    db.commit()
    db.refresh(meal)
    return _meal_response(meal)


@mess_router.delete("/meals/{meal_id}", status_code=204)
def delete_meal(
    meal_id: int,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    meal = db.get(MealItem, meal_id)
    if not meal:
        raise NotFoundError("Meal item not found")
    if db.scalar(
        select(MessMenuSchedule.id).where(MessMenuSchedule.meal_item_id == meal_id).limit(1)
    ):
        raise ConflictError("This meal is scheduled and cannot be deleted")
    db.delete(meal)
    db.commit()
    return None


@mess_router.get("/{mess_id}/menu", response_model=MenuScheduleResponse)
def get_menu(
    mess_id: int,
    scheduled_date: date = Query(alias="date"),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    _get_facility(db, mess_id, property_scope)
    schedules = db.scalars(
        select(MessMenuSchedule)
        .options(joinedload(MessMenuSchedule.meal_item))
        .where(
            MessMenuSchedule.mess_id == mess_id,
            MessMenuSchedule.scheduled_date == scheduled_date,
        )
        .order_by(MessMenuSchedule.meal_category, MealItem.name)
        .join(MealItem, MealItem.id == MessMenuSchedule.meal_item_id)
    ).all()
    return MenuScheduleResponse(
        messId=mess_id,
        scheduledDate=scheduled_date,
        items=[
            MenuItemResponse(
                id=schedule.id,
                mealCategory=schedule.meal_category,
                mealItem=_meal_response(schedule.meal_item),
            )
            for schedule in schedules
        ],
    )


@mess_router.post("/{mess_id}/menu", response_model=MenuScheduleResponse)
def save_menu(
    mess_id: int,
    payload: MenuScheduleRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_admin(actor)
    _get_facility(db, mess_id, property_scope)
    if payload.scheduled_date <= date.today():
        raise BadRequestError("Menus can only be scheduled or edited for future dates")
    if len(payload.meal_item_ids) != len(set(payload.meal_item_ids)):
        raise BadRequestError("Each meal item may only be scheduled once per menu")
    meals = db.scalars(
        select(MealItem).where(MealItem.id.in_(payload.meal_item_ids))
    ).all() if payload.meal_item_ids else []
    if len(meals) != len(payload.meal_item_ids):
        raise BadRequestError("One or more meal items do not exist")

    existing_schedules = db.scalars(
        select(MessMenuSchedule).where(
            MessMenuSchedule.mess_id == mess_id,
            MessMenuSchedule.scheduled_date == payload.scheduled_date,
        )
    ).all()
    desired_ids = {meal.id for meal in meals}
    existing_by_meal_id = {schedule.meal_item_id: schedule for schedule in existing_schedules}
    for schedule in existing_schedules:
        if schedule.meal_item_id not in desired_ids:
            db.delete(schedule)
    for meal in meals:
        if meal.id not in existing_by_meal_id:
            db.add(
                MessMenuSchedule(
                    mess_id=mess_id,
                    meal_item_id=meal.id,
                    scheduled_date=payload.scheduled_date,
                    meal_category=meal.category,
                )
            )
    db.commit()
    return get_menu(
        mess_id,
        payload.scheduled_date,
        actor=actor,
        db=db,
        property_scope=property_scope,
    )
