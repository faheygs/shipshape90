delete from public.task_catalog
where owner_id is null
  and title in (
    'Gratitude practice',
    'Eat five servings of produce',
    'Hit protein target',
    'Prepare tomorrow’s meals',
    'Sleep target',
    'Encourage a teammate'
  );
