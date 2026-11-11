from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import DietaryType, MealCategory


class MessRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class MessFacilityCreateRequest(MessRequest):
    property_id: str = Field(alias="propertyId", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=100)
    is_default: bool = Field(default=False, alias="isDefault")
    capacity: int | None = Field(default=None, ge=1)


class MessFacilityUpdateRequest(MessRequest):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_default: bool | None = Field(default=None, alias="isDefault")
    capacity: int | None = Field(default=None, ge=1)


class MessFacilityResponse(BaseModel):
    id: int
    property_id: str = Field(alias="propertyId")
    property_name: str = Field(alias="propertyName")
    property_type: str = Field(alias="propertyType")
    name: str
    is_default: bool = Field(alias="isDefault")
    capacity: int | None
    created_at: datetime = Field(alias="createdAt")


class MealItemCreateRequest(MessRequest):
    name: str = Field(min_length=1, max_length=100)
    category: MealCategory
    dietary_type: DietaryType = Field(default=DietaryType.VEG, alias="dietaryType")
    ingredients: str | None = Field(default=None, max_length=5000)


class MealItemUpdateRequest(MessRequest):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: MealCategory | None = None
    dietary_type: DietaryType | None = Field(default=None, alias="dietaryType")
    ingredients: str | None = Field(default=None, max_length=5000)


class MealItemResponse(BaseModel):
    id: int
    name: str
    category: MealCategory
    dietary_type: DietaryType = Field(alias="dietaryType")
    ingredients: str | None
    created_at: datetime = Field(alias="createdAt")


class MenuScheduleRequest(MessRequest):
    scheduled_date: date = Field(alias="scheduledDate")
    meal_item_ids: list[int] = Field(alias="mealItemIds", max_length=100)


class MenuItemResponse(BaseModel):
    id: int
    meal_category: MealCategory = Field(alias="mealCategory")
    meal_item: MealItemResponse = Field(alias="mealItem")


class MenuScheduleResponse(BaseModel):
    mess_id: int = Field(alias="messId")
    scheduled_date: date = Field(alias="scheduledDate")
    items: list[MenuItemResponse]
