-- Enable Row Level Security on "PhoneNumber".
--
-- The table was created by 20260706070000_phone_numbers_expand without RLS,
-- unlike every other public table. It is never read through PostgREST or
-- Supabase Realtime — all app access goes through Prisma, which connects as
-- the table owner and therefore bypasses RLS. Enabling RLS with no policies
-- denies access to the anon/authenticated roles, closing the "public anon
-- key can read and write this table" exposure flagged by the Supabase
-- security advisor, with zero impact on the application.

ALTER TABLE "PhoneNumber" ENABLE ROW LEVEL SECURITY;
