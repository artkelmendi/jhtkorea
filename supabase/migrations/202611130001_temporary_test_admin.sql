begin;

-- Password-only access is an explicit, expiring exception for the second slot.
-- NULL keeps every existing administrator under the normal MFA requirement.
alter table jht_private.admin_slots
  add column password_only_until timestamptz,
  add constraint admin_password_only_test_slot
    check (password_only_until is null or (slot = 2 and not allow_enrollment));

commit;
