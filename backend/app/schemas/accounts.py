from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserScopeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    boardingHouseIds: list[str] = Field(default_factory=list, max_length=100)
    roomIds: list[str] = Field(default_factory=list, max_length=500)


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9._]+$")
    displayName: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)
    role: Literal["admin", "landlord", "tenant"]
    scope: UserScopeInput

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("displayName", mode="before")
    @classmethod
    def strip_display_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    displayName: str = Field(min_length=1, max_length=100)
    role: Literal["admin", "landlord", "tenant"]
    scope: UserScopeInput

    @field_validator("displayName", mode="before")
    @classmethod
    def strip_display_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class CreateLandlordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9._]+$")
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=100)
    boarding_house_ids: list[str] = Field(default_factory=list, max_length=100)


class CreateTenantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9._]+$")
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=100)
    room_id: str = Field(min_length=1, max_length=20)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()
