-- Allow only the trusted server role to access application tables through the Data API.
grant all privileges on public.app_state to service_role;
grant all privileges on public.app_users, public.projects, public.categories, public.scrape_jobs,
  public.places, public.api_credentials, public.audit_logs, public.scraper_settings to service_role;
