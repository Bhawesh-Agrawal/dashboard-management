# Deployment State & GCP Inventory

Project: `dashboard-management-prod`  
Region: `asia-south1`  
Billing Account: `billingAccounts/012778-5CB487-6DAC45` (`billingEnabled: true`)

---

## Part B: Read-Only GCP Preflight Inventory

### Commands Run (Read-Only)
- `gcloud config get-value project` -> `dashboard-management-prod`
- `gcloud services list --enabled --format="value(config.name)" | sort`
- `gcloud artifacts repositories list --location=asia-south1 --format="table(name,format,createTime)"`
- `gcloud artifacts repositories describe dashboard-management --location=asia-south1 --format="yaml(cleanupPolicies,cleanupPolicyDryRun)"`
- `gcloud secrets list --format="table(name,createTime)"`
- `gcloud iam service-accounts list --format="table(email,displayName,disabled)"`
- `gcloud iam service-accounts keys list --iam-account=github-deployer@dashboard-management-prod.iam.gserviceaccount.com --managed-by=user --format="table(name,validAfterTime,validBeforeTime,keyType)"`
- `gcloud iam service-accounts keys list --iam-account=862005715307-compute@developer.gserviceaccount.com --managed-by=user --format="table(name,validAfterTime,validBeforeTime,keyType)"`
- `gcloud run services list --region=asia-south1 --format="table(metadata.name,status.url,status.conditions[0].status)"`
- `gcloud scheduler jobs list --location=asia-south1 --format="table(name,schedule,timeZone,state)"`
- `gcloud billing projects describe dashboard-management-prod --format="table(billingAccountName,billingEnabled)"`
- `npm run check:env -- --gcp`

### Key Findings
1. **Enabled APIs:** `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`, `cloudscheduler.googleapis.com`, `run.googleapis.com`, `secretmanager.googleapis.com`, `iam.googleapis.com`, `logging.googleapis.com`, `monitoring.googleapis.com` are enabled. `billingbudgets.googleapis.com` is **not** enabled yet.
2. **Artifact Registry:** `dashboard-management` (`DOCKER`, `asia-south1`) exists, current size `584.842MB` (exceeds 0.5 GB free tier), and `cleanupPolicies` is `null` (no cleanup policy applied yet).
3. **Secret Manager (20 secrets present, names only):**
   - `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `S3_ACCESS_KEY_ID`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_SECRET_ACCESS_KEY`, `VAPID_EMAIL`, `VAPID_PRIVATE_KEY`.
   - **Missing secret referenced by `cloudbuild.yaml`:** `CRON_BEARER_TOKEN` is NOT in Secret Manager (only `CRON_SECRET` exists).
4. **IAM Service Accounts & Keys:**
   - `862005715307-compute@developer.gserviceaccount.com` (0 user-managed keys)
   - `github-deployer@dashboard-management-prod.iam.gserviceaccount.com` (**4 user-managed keys** active: `abc49c18e7d01105f5f2ee25d081820ebb3f4711`, `8ab4d598fa2ad453f4e8dac977e13c5f002d47ad`, `d254f8b52c5527f5b6f760e6df2ffd922a0d9c88`, `5033464357441e7a59c86db4892b2ff17a42e001`)
   - **Missing SA referenced by `cloudbuild.yaml` (`_SCHEDULER_SA`):** `scheduler-invoker@dashboard-management-prod.iam.gserviceaccount.com` does NOT exist yet.
5. **Cloud Run:** `dashboard-management` exists at `https://dashboard-management-2g4ikz4qyq-el.a.run.app`, current condition status `False`.
6. **Cloud Scheduler:** `notifications` (`*/5 * * * *`, `Asia/Kolkata`, `ENABLED`) and `daily-diagnostics` (`0 7 * * *`, `Asia/Kolkata`, `ENABLED`) exist. (Note: `cloudbuild.yaml` updates/creates `notifications` and `daily-maintenance` in `Asia/Kathmandu`.)
7. **`npm run check:env -- --gcp`:** Reports `CRON_OIDC_AUDIENCE` and `CRON_OIDC_SERVICE_ACCOUNT_EMAIL` as `gcp=UNSET` (expected until `cloudbuild.yaml` deploys with `--set-env-vars`).

---

## Previous Serving Revision & Rollback Command
- **Previous Serving Revision (100% traffic):** `dashboard-management-00017-s5m` (deployed `2026-08-13 06:10:46 UTC`)
- **Exact Rollback Command:**
```bash
gcloud run services update-traffic dashboard-management --region=asia-south1 --to-revisions=dashboard-management-00017-s5m=100
```

---

## Part C: GCP Setup Executed

### Commands Run (Secrets Masked / Omitted)
1. **Deleted all 4 user-managed keys on `github-deployer@dashboard-management-prod.iam.gserviceaccount.com`:**
   - `gcloud iam service-accounts keys delete <KEY_ID> --iam-account=github-deployer@dashboard-management-prod.iam.gserviceaccount.com --quiet` for:
     - `abc49c18e7d01105f5f2ee25d081820ebb3f4711`
     - `8ab4d598fa2ad453f4e8dac977e13c5f002d47ad`
     - `d254f8b52c5527f5b6f760e6df2ffd922a0d9c88` (leaked key in git history `5182cfff`)
     - `5033464357441e7a59c86db4892b2ff17a42e001`
   - Consequence: GitHub Actions cannot deploy until keyless Workload Identity Federation (WIF) is configured (workflow is `workflow_dispatch` only).
2. **Created `scheduler-invoker` SA (no keys) and granted `roles/run.invoker` on `dashboard-management`:**
   - `gcloud iam service-accounts create scheduler-invoker --display-name="Cloud Scheduler Invoker"`
   - `gcloud run services add-iam-policy-binding dashboard-management --region=asia-south1 --member="serviceAccount:scheduler-invoker@dashboard-management-prod.iam.gserviceaccount.com" --role="roles/run.invoker" --quiet`
3. **Minimal, resource-scoped IAM bindings added:**
   - `roles/secretmanager.secretAccessor` for `862005715307-compute@developer.gserviceaccount.com` on each of the 20 secrets referenced by `cloudbuild.yaml`: `DATABASE_URL`, `DIRECT_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `CRON_BEARER_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.
   - `roles/iam.serviceAccountUser` for `862005715307@cloudbuild.gserviceaccount.com` ON `862005715307-compute@developer.gserviceaccount.com`.
   - `roles/iam.serviceAccountUser` for `862005715307@cloudbuild.gserviceaccount.com` ON `scheduler-invoker@dashboard-management-prod.iam.gserviceaccount.com`.
4. **Created `CRON_BEARER_TOKEN` secret:**
   - `openssl rand -hex 32 | tr -d '\n' | gcloud secrets create CRON_BEARER_TOKEN --replication-policy=automatic --data-file=-` (`CRON_SECRET` left untouched).
5. **Artifact Registry cleanup policy:** Deferred until end of Part F (dry-run first, then approval).
6. **Billing budget created:**
   - `gcloud services enable billingbudgets.googleapis.com`
   - `gcloud billing budgets create --billing-account=012778-5CB487-6DAC45 --display-name="dashboard-management-prod monthly cap" --budget-amount=300INR --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --filter-projects="projects/dashboard-management-prod"` -> Created `a194c76c-287b-423f-ae27-069b6da80e60`.
