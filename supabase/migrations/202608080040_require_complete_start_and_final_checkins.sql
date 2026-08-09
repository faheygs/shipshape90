update public.challenge_checkpoints
set requires_weight = true,
    requires_body_fat = true,
    requires_photo = true
where checkpoint_kind in ('start', 'final')
  and not (requires_weight and requires_body_fat and requires_photo);

alter table public.challenge_checkpoints
  add constraint challenge_checkpoints_complete_bookends_check check (
    checkpoint_kind = 'milestone'
    or (requires_weight and requires_body_fat and requires_photo)
  );

comment on constraint challenge_checkpoints_complete_bookends_check on public.challenge_checkpoints is
  'Start and Final check-ins always require weight, body fat, and a progress photo.';
