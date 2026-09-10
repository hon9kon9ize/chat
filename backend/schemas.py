from typing import Literal
from pydantic import BaseModel, field_validator


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    agent: str
    messages: list[Message]

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: list[Message]) -> list[Message]:
        if not v:
            raise ValueError("messages cannot be empty")
        if len(v) > 100:
            raise ValueError("too many messages")
        for msg in v:
            if len(msg.content) > 16000:
                raise ValueError("message too long")
        return v

    @field_validator("agent")
    @classmethod
    def validate_agent(cls, v: str) -> str:
        if not v or len(v) > 64:
            raise ValueError("invalid agent id")
        return v


class AgentInfo(BaseModel):
    id: str
    name: str
    description: str = ""


class LimitInfo(BaseModel):
    limit: int
    remaining: int
    reset_at: str
