"""Routes inbound queries to the right specialist agent."""
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

INTENTS = ["password_reset", "billing_question", "bug_report", "feature_request", "smalltalk"]


class Route(BaseModel):
    intent: str
    escalate_to_human: bool


def route_query(query: str) -> Route:
    """Pick the intent and whether a human should look at this."""
    resp = llm.invoke(
        f"Classify this query into one of {INTENTS} and decide if escalation is needed: {query}"
    )
    return Route.model_validate_json(resp.content)
