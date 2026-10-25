from __future__ import annotations

import strawberry
from fastapi import Request
from strawberry.fastapi import GraphQLRouter
from strawberry.scalars import JSON

from . import data


@strawberry.type
class Query:
    @strawberry.field
    def states(self) -> JSON:
        return data.states()

    @strawberry.field
    async def districts(self, info: strawberry.Info, state: str | None = None) -> JSON:
        return await data.districts(info.context["pool"], state)

    @strawberry.field
    async def assemblies(
        self,
        info: strawberry.Info,
        district: str | None = None,
        district_code: str | None = None,
    ) -> JSON:
        return await data.assemblies(info.context["pool"], district, district_code)

    @strawberry.field
    async def villages(self, info: strawberry.Info, ac_no: str) -> JSON:
        return await data.villages(info.context["pool"], ac_no)

    @strawberry.field
    async def assembly_dashboard(self, info: strawberry.Info, ac_no: str) -> JSON | None:
        return await data.assembly_dashboard(info.context["pool"], ac_no)

    @strawberry.field
    async def poll_results(
        self,
        info: strawberry.Info,
        state: str | None = None,
        district_code: str | None = None,
        ac_no: str | None = None,
        village_id: int | None = None,
        level: str = "state",
        election_year: int | None = None,
    ) -> JSON:
        return await data.poll_results(
            info.context["pool"], state, district_code, ac_no, village_id, level, election_year
        )

    @strawberry.field
    async def election_years(
        self,
        info: strawberry.Info,
        state: str | None = None,
        district_code: str | None = None,
        ac_no: str | None = None,
        village_id: int | None = None,
        level: str = "state",
    ) -> JSON:
        return await data.election_years(
            info.context["pool"], state, district_code, ac_no, village_id, level
        )


schema = strawberry.Schema(query=Query)


async def get_context(request: Request):
    return {"pool": getattr(request.app.state, "pool", None)}


graphql_router = GraphQLRouter(schema, context_getter=get_context)
