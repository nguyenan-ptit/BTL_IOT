from pydantic import BaseModel, ConfigDict, Field, field_validator


class BoardingHouseCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    landlordId: int | None = Field(default=None, ge=1)

    @field_validator("name", "address", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class RoomCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    boardingHouseId: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=50)

    @field_validator("id", "name", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value
