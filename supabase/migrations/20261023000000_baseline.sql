-- Baseline schema for Explore Halal, captured from production on 2026-10-23
-- with `pg_dump --schema-only --schema=public --no-owner` (PostgreSQL 17).
--
-- Every later schema change must be a new numbered migration in this folder,
-- rehearsed locally before production. See README "Database migrations".
--
-- Edits to the raw dump: removed pg_dump's \restrict/\unrestrict psql
-- meta-commands and `CREATE SCHEMA public` (it always exists on Supabase);
-- appended the auth.users trigger and the ensure_rls event trigger, which live
-- outside the public schema and so are not captured by the dump.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- (public schema already exists on Supabase)


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: deleted_restaurants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."deleted_restaurants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "postcode" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "cuisine_type" "text" NOT NULL,
    "certification_body" "text" DEFAULT 'COMMUNITY'::"text" NOT NULL,
    "certification_status" "text" DEFAULT 'Unverified'::"text" NOT NULL,
    "last_scraped_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "cuisine_group" "text",
    "fsq_id" "text",
    "google_maps_url" "text",
    "rating" numeric(2,1),
    "review_count" integer,
    "certification_type" "text" DEFAULT 'Other'::"text" NOT NULL,
    "image_url" "text",
    "osm_id" "text",
    "place_id" "text",
    "match_key" "text",
    "price" "text",
    "halal_status" "text",
    "halal_description" "text",
    "alcohol_policy" "text",
    "halal_rank_score" integer,
    "halal_rank_tier" "text",
    "hand_slaughtered" boolean,
    "is_trending" boolean,
    "will_return_percentage" numeric,
    "google_rating" numeric,
    "google_review_count" integer,
    "business_hours" "jsonb",
    "archive_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_reason" "text"
);


--
-- Name: forum_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."forum_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: forum_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."forum_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT 'Member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."restaurants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "postcode" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "cuisine_type" "text" NOT NULL,
    "certification_body" "text" DEFAULT 'COMMUNITY'::"text" NOT NULL,
    "certification_status" "text" DEFAULT 'Unverified'::"text" NOT NULL,
    "last_scraped_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "cuisine_group" "text",
    "fsq_id" "text",
    "google_maps_url" "text",
    "rating" numeric(2,1),
    "review_count" integer,
    "certification_type" "text" DEFAULT 'Other'::"text" NOT NULL,
    "image_url" "text",
    "osm_id" "text",
    "place_id" "text",
    "match_key" "text",
    "price" "text",
    "halal_status" "text",
    "halal_description" "text",
    "alcohol_policy" "text",
    "halal_rank_score" integer,
    "halal_rank_tier" "text",
    "hand_slaughtered" boolean,
    "is_trending" boolean,
    "will_return_percentage" numeric,
    "google_rating" numeric,
    "google_review_count" integer,
    "business_hours" "jsonb",
    CONSTRAINT "restaurants_certification_body_check" CHECK (("certification_body" = ANY (ARRAY['HMC'::"text", 'HFA'::"text", 'BOTH'::"text", 'COMMUNITY'::"text"]))),
    CONSTRAINT "restaurants_certification_status_check" CHECK (("certification_status" = ANY (ARRAY['Certified'::"text", 'Pending'::"text", 'Expired'::"text", 'Suspended'::"text", 'Unverified'::"text", 'zabihah'::"text"]))),
    CONSTRAINT "restaurants_certification_type_check" CHECK (("certification_type" = ANY (ARRAY['HMC'::"text", 'HFA'::"text", 'Other'::"text"])))
);


--
-- Name: COLUMN "restaurants"."source"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."restaurants"."source" IS 'Where this row''s certification claim came from (e.g. HMC directory scrape, KFC official halal locator).';


--
-- Name: COLUMN "restaurants"."cuisine_group"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."restaurants"."cuisine_group" IS 'Canonical cuisine group derived from cuisine_type via lib/cuisine-groups.';


--
-- Name: COLUMN "restaurants"."fsq_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."restaurants"."fsq_id" IS 'Foursquare venue id from the HalalAPI import (halal-api.vercel.app); used for idempotent re-imports.';


--
-- Name: search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."search_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "postcode" "text",
    "distance_miles" integer,
    "cuisine_type" "text",
    "latitude" double precision,
    "longitude" double precision,
    "results_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: deleted_restaurants deleted_restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deleted_restaurants"
    ADD CONSTRAINT "deleted_restaurants_pkey" PRIMARY KEY ("archive_id");


--
-- Name: forum_comments forum_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id");


--
-- Name: forum_threads forum_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");


--
-- Name: search_logs search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."search_logs"
    ADD CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id");


--
-- Name: deleted_restaurants_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deleted_restaurants_deleted_at_idx" ON "public"."deleted_restaurants" USING "btree" ("deleted_at");


--
-- Name: deleted_restaurants_original_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deleted_restaurants_original_id_idx" ON "public"."deleted_restaurants" USING "btree" ("id");


--
-- Name: forum_comments_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "forum_comments_parent_idx" ON "public"."forum_comments" USING "btree" ("parent_id");


--
-- Name: forum_comments_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "forum_comments_thread_idx" ON "public"."forum_comments" USING "btree" ("thread_id");


--
-- Name: forum_threads_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "forum_threads_created_idx" ON "public"."forum_threads" USING "btree" ("created_at" DESC);


--
-- Name: restaurants_certification_body_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_certification_body_idx" ON "public"."restaurants" USING "btree" ("certification_body");


--
-- Name: restaurants_certification_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_certification_type_idx" ON "public"."restaurants" USING "btree" ("certification_type");


--
-- Name: restaurants_cuisine_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_cuisine_type_idx" ON "public"."restaurants" USING "btree" ("cuisine_type");


--
-- Name: restaurants_fsq_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_fsq_id_idx" ON "public"."restaurants" USING "btree" ("fsq_id");


--
-- Name: restaurants_lat_lng_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_lat_lng_idx" ON "public"."restaurants" USING "btree" ("latitude", "longitude");


--
-- Name: restaurants_match_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "restaurants_match_key_key" ON "public"."restaurants" USING "btree" ("match_key");


--
-- Name: restaurants_osm_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "restaurants_osm_id_key" ON "public"."restaurants" USING "btree" ("osm_id") WHERE ("osm_id" IS NOT NULL);


--
-- Name: restaurants_place_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "restaurants_place_id_key" ON "public"."restaurants" USING "btree" ("place_id") WHERE ("place_id" IS NOT NULL);


--
-- Name: restaurants_postcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "restaurants_postcode_idx" ON "public"."restaurants" USING "btree" ("postcode");


--
-- Name: search_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "search_logs_created_at_idx" ON "public"."search_logs" USING "btree" ("created_at" DESC);


--
-- Name: search_logs_postcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "search_logs_postcode_idx" ON "public"."search_logs" USING "btree" ("postcode");


--
-- Name: forum_comments forum_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: forum_comments forum_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."forum_comments"("id") ON DELETE CASCADE;


--
-- Name: forum_comments forum_comments_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: search_logs Anyone can insert search logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert search logs" ON "public"."search_logs" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: restaurants Public can read restaurants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read restaurants" ON "public"."restaurants" FOR SELECT USING (true);


--
-- Name: forum_comments comments_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comments_delete_own" ON "public"."forum_comments" FOR DELETE USING (("auth"."uid"() = "author_id"));


--
-- Name: forum_comments comments_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comments_insert_own" ON "public"."forum_comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "author_id") AND (EXISTS ( SELECT 1
   FROM "public"."forum_threads" "t"
  WHERE ("t"."id" = "forum_comments"."thread_id"))) AND (("parent_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."forum_comments" "c"
  WHERE (("c"."id" = "forum_comments"."parent_id") AND ("c"."thread_id" = "forum_comments"."thread_id")))))));


--
-- Name: forum_comments comments_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comments_select_all" ON "public"."forum_comments" FOR SELECT USING (true);


--
-- Name: forum_comments comments_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comments_update_own" ON "public"."forum_comments" FOR UPDATE USING (("auth"."uid"() = "author_id"));


--
-- Name: deleted_restaurants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."deleted_restaurants" ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."forum_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."forum_threads" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));


--
-- Name: restaurants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;

--
-- Name: search_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."search_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_threads threads_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "threads_delete_own" ON "public"."forum_threads" FOR DELETE USING (("auth"."uid"() = "author_id"));


--
-- Name: forum_threads threads_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "threads_insert_own" ON "public"."forum_threads" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));


--
-- Name: forum_threads threads_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "threads_select_all" ON "public"."forum_threads" FOR SELECT USING (true);


--
-- Name: forum_threads threads_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "threads_update_own" ON "public"."forum_threads" FOR UPDATE USING (("auth"."uid"() = "author_id"));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "rls_auto_enable"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


--
-- Name: TABLE "deleted_restaurants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."deleted_restaurants" TO "anon";
GRANT ALL ON TABLE "public"."deleted_restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_restaurants" TO "service_role";


--
-- Name: TABLE "forum_comments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."forum_comments" TO "anon";
GRANT ALL ON TABLE "public"."forum_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_comments" TO "service_role";


--
-- Name: TABLE "forum_threads"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."forum_threads" TO "anon";
GRANT ALL ON TABLE "public"."forum_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_threads" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "restaurants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."restaurants" TO "anon";
GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";


--
-- Name: TABLE "search_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."search_logs" TO "anon";
GRANT ALL ON TABLE "public"."search_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."search_logs" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--



-- ---------------------------------------------------------------------------
-- Objects outside the public schema (not captured by pg_dump --schema=public)
-- ---------------------------------------------------------------------------

-- Create a public.profiles row whenever a Supabase auth user is created.
CREATE OR REPLACE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- Safety net: automatically enable RLS on every new table created in public.
CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();
