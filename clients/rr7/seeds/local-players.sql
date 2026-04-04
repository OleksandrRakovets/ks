INSERT OR REPLACE INTO guest_players (
  guest_player_id,
  first_name_uk,
  last_name_uk,
  first_name_en,
  last_name_en,
  created_at
) VALUES
  ('01JQZ6G1UEST00000000000001', 'Іван', 'Петренко', 'Ivan', 'Petrenko', unixepoch() * 1000),
  ('01JQZ6G1UEST00000000000002', 'Олег', 'Шевченко', 'Oleh', 'Shevchenko', unixepoch() * 1000);

INSERT OR REPLACE INTO verified_players (
  verified_player_id,
  first_name_uk,
  last_name_uk,
  first_name_en,
  last_name_en,
  created_at
) VALUES
  ('01JQZ6V3R1F13D000000000001', 'Анна', 'Коваленко', 'Anna', 'Kovalenko', unixepoch() * 1000),
  ('01JQZ6V3R1F13D000000000002', 'Марія', 'Мельник', 'Mariia', 'Melnyk', unixepoch() * 1000);
