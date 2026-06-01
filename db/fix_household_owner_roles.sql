-- =====================================================================
-- WiseBudget - repair owner/admin roles after partial household migration
-- Run in Supabase SQL Editor.
-- =====================================================================

-- 1) Ensure every household has a created_by when possible.
update public.households h
set created_by = picked.user_id
from (
  select distinct on (hm.household_id)
    hm.household_id,
    hm.user_id
  from public.household_members hm
  order by hm.household_id, hm.joined_at asc nulls last, hm.user_id
) picked
where h.id = picked.household_id
  and h.created_by is null;

-- 2) Promote created_by to owner.
update public.household_members hm
set role = 'owner'
from public.households h
where hm.household_id = h.id
  and hm.user_id = h.created_by
  and hm.role <> 'owner';

-- 3) Safety net: if a household still has no owner, promote its first member.
with first_member as (
  select distinct on (household_id)
    household_id,
    user_id
  from public.household_members
  order by household_id, joined_at asc nulls last, user_id
),
households_without_owner as (
  select fm.household_id, fm.user_id
  from first_member fm
  where not exists (
    select 1
    from public.household_members hm
    where hm.household_id = fm.household_id
      and hm.role = 'owner'
  )
)
update public.household_members hm
set role = 'owner'
from households_without_owner hwo
where hm.household_id = hwo.household_id
  and hm.user_id = hwo.user_id;

-- 4) Check current signed-in user's context.
select * from public.get_household_context();

-- 5) Check households without owner. This should return zero rows.
select h.id, h.name, count(hm.user_id) as members
from public.households h
left join public.household_members hm on hm.household_id = h.id
where not exists (
  select 1
  from public.household_members owner_hm
  where owner_hm.household_id = h.id
    and owner_hm.role = 'owner'
)
group by h.id, h.name;
