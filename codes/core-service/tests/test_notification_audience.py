import uuid

from app.services.notification_audience import (
    plan_membership_added,
    plan_participant_changes,
    plan_task_created,
)


def test_self_join_notifies_assignee_not_actor():
    actor = uuid.uuid4()
    assignee = uuid.uuid4()
    intents = plan_participant_changes(
        actor_id=actor,
        actor_name="我",
        task_title="方案",
        link="/workspace/w/projects/p/items/i",
        assignee_id=assignee,
        creator_id=uuid.uuid4(),
        before_participant_ids=[],
        after_participant_ids=[actor],
    )
    assert len(intents) == 1
    assert intents[0].scenario_key == "task_self_join"
    assert intents[0].user_ids == [assignee]
    assert intents[0].sender_user_id == actor


def test_self_join_falls_back_to_creator_when_no_assignee():
    actor = uuid.uuid4()
    creator = uuid.uuid4()
    intents = plan_participant_changes(
        actor_id=actor,
        actor_name="我",
        task_title="方案",
        link="/t",
        assignee_id=None,
        creator_id=creator,
        before_participant_ids=[],
        after_participant_ids=[actor],
    )
    assert intents[0].user_ids == [creator]


def test_self_join_skips_when_assignee_is_actor():
    actor = uuid.uuid4()
    intents = plan_participant_changes(
        actor_id=actor,
        actor_name="我",
        task_title="方案",
        link="/t",
        assignee_id=actor,
        creator_id=uuid.uuid4(),
        before_participant_ids=[],
        after_participant_ids=[actor],
    )
    assert intents == []


def test_member_added_excludes_actor_and_dedupes():
    actor = uuid.uuid4()
    other = uuid.uuid4()
    intents = plan_participant_changes(
        actor_id=actor,
        actor_name="我",
        task_title="方案",
        link="/t",
        assignee_id=uuid.uuid4(),
        creator_id=None,
        before_participant_ids=[other],
        after_participant_ids=[other, actor, other, uuid.uuid4()],
    )
    added = [item for item in intents if item.scenario_key == "task_member_added"]
    assert len(added) == 1
    assert actor not in added[0].user_ids
    assert other not in added[0].user_ids
    assert len(added[0].user_ids) == 1


def test_task_created_excludes_actor_and_includes_initial_participants():
    actor = uuid.uuid4()
    member = uuid.uuid4()
    assignee = uuid.uuid4()
    intents = plan_task_created(
        actor_id=actor,
        actor_name="我",
        task_title="方案",
        project_name="项目",
        link="/workspace/w/projects/p/items/i",
        project_member_ids=[actor, member, member],
        participant_ids=[actor, member],
        assignee_id=assignee,
        creator_id=actor,
    )
    keys = [item.scenario_key for item in intents]
    assert keys == ["task_created_in_project", "task_self_join", "task_member_added"]
    created = intents[0]
    assert created.user_ids == [member]
    assert created.variables["project_name"] == "项目"
    assert intents[1].user_ids == [assignee]
    assert intents[2].user_ids == [member]


def test_membership_added_skips_self():
    actor = uuid.uuid4()
    assert (
        plan_membership_added(
            scenario_key="workspace_member_added",
            actor_id=actor,
            actor_name="我",
            target_user_id=actor,
            link="/workspace/w",
            variables={"actor_name": "我", "workspace_name": "空间"},
        )
        is None
    )
    other = uuid.uuid4()
    intent = plan_membership_added(
        scenario_key="project_member_added",
        actor_id=actor,
        actor_name="我",
        target_user_id=other,
        link="/workspace/w/projects/p",
        variables={"actor_name": "我", "project_name": "项目", "workspace_name": "空间"},
    )
    assert intent is not None
    assert intent.user_ids == [other]
    assert intent.scenario_key == "project_member_added"
