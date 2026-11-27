alter table public.appointments add column attendance text, add column collected_ars integer;
alter table public.appointments add constraint appointment_attendance_valid check (attendance is null or attendance in ('completed','no_show')), add constraint appointment_collected_valid check (collected_ars is null or collected_ars>=0), add constraint appointment_outcome_requires_confirmed check ((attendance is null and collected_ars is null) or (status='confirmed' and source='manual' and attendance is not null));
create or replace function private.validate_appointment_outcome() returns trigger language plpgsql security invoker set search_path='' as $$
begin
if new.attendance is not null and new.ends_at>now() then raise exception 'appointment_not_finished'; end if;
return new;end;$$;
revoke all on function private.validate_appointment_outcome() from public,anon,authenticated;
create trigger validate_appointment_outcome before insert or update of attendance,collected_ars on public.appointments for each row execute function private.validate_appointment_outcome();
grant update(attendance,collected_ars) on public.appointments to authenticated;