# Deployment Pipelines Comparison & Architecture Recommendation

This document analyzes the two deployment pipeline configurations present in the repository:
1. `cloudbuild.yaml` (Google Cloud Build definition)
2. `.github/workflows/deploy.yml` (GitHub Actions workflow)

Neither file has been deleted, preserving operational flexibility.

---

## 1. Current State & Interaction

Currently, the two files operate in a **hybrid dependency model**:
- **GitHub Actions (`.github/workflows/deploy.yml`)** acts as the CI/CD trigger: on push to `master` or `main`, an Ubuntu runner boots, authenticates to GCP using a static service account key stored in GitHub secret `${{ secrets.GCP_SA_KEY }}`, and runs `gcloud builds submit --config=cloudbuild.yaml .`.
- **Google Cloud Build (`cloudbuild.yaml`)** acts as the remote execution engine: it pulls build secrets from Secret Manager, builds the multi-stage Docker container with production build arguments, pushes image tags to Artifact Registry (`asia-south1-docker.pkg.dev`), deploys the revision to Cloud Run (`--min-instances=0`, `--max-instances=2`, `--memory=512Mi`), and updates Cloud Scheduler HTTP jobs with OIDC authentication.

---

## 2. Pipeline Comparison

| Evaluation Dimension | GitHub Actions (Orchestrator) | Cloud Build (Standalone Trigger) | GitHub Actions + Keyless WIF (Recommended) |
| :--- | :--- | :--- | :--- |
| **Authentication Security** | ❌ **High Risk**: Relies on long-lived `GCP_SA_KEY` JSON secret in GitHub. Vulnerable to leakage or accidental git commits. | ✅ **Secure**: Uses GCP internal IAM service account attached to Cloud Build. | ✅ **Best-in-Class**: Short-lived OIDC exchange via Workload Identity Federation (no private keys exist). |
| **Developer Experience** | ✅ High: Build status visible directly in GitHub PRs, commits, and Actions tab. | ⚠️ Low: Build status and logs only visible in GCP Console or via gcloud CLI. | ✅ High: Native GitHub Actions UI, inline status checks, branch protection rules. |
| **Cost (Free Tier)** | 2,000 free runner minutes/month in GitHub Actions + Cloud Build build minutes. | 120 free build-minutes/day on Cloud Build default pool. | Negligible cost: GitHub free runner triggers OIDC exchange; Cloud Build builds container. |
| **Pre-Deploy Gating** | ✅ Can run `npm run test:ci` and linting on free GitHub runner before submitting build to GCP. | ❌ Requires either a dedicated Cloud Build step (consuming GCP minutes) or post-commit detection. | ✅ Run lint, typecheck, and vitest tests on GitHub runner; submit to Cloud Build only on green tests. |
| **Vendor Portability** | ✅ Workflows are portable across cloud providers. | ❌ Proprietary GCP Cloud Build syntax. | ✅ Standard GitHub Actions workflow. |

---

## 3. Recommendation

**Winner:** **GitHub Actions with Workload Identity Federation (WIF)**.

### Rationale:
1. **Elimination of Secret Keys:** Static JSON keys (`sa_key.json` or `GCP_SA_KEY`) are the #1 source of credential compromise in CI/CD. WIF completely eliminates long-lived keys.
2. **Unified Pre-flight Checks:** GitHub Actions can run `npm run test:ci` (`tsc --noEmit`, ESLint, Vitest) *before* invoking Cloud Build, saving GCP build quota on broken commits.
3. **Auditability & Visibility:** Developers track deployment status directly in GitHub without requiring GCP Console access for routine deploys.

---

## 4. Keyless Workload Identity Federation (WIF) Setup Guide

Follow these steps to transition `.github/workflows/deploy.yml` from `GCP_SA_KEY` to keyless authentication.

### Step 1: Set Environment Variables
```bash
export PROJECT_ID="dashboard-management-prod"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export POOL_NAME="github-actions-pool"
export PROVIDER_NAME="github-provider"
export SA_NAME="github-deployer"
export GITHUB_REPO="owner/dashboard-management" # Replace with your GitHub owner/repo
```

### Step 2: Create the Workload Identity Pool
```bash
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### Step 3: Create the Workload Identity Provider
```bash
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub Actions OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$GITHUB_REPO'"
```

### Step 4: Create Deployer Service Account (or use existing)
```bash
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Deployer"

export SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
```

### Step 5: Grant Required IAM Roles to Service Account
```bash
# Cloud Build Editor to submit builds
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudbuild.builds.editor"

# Storage admin to upload build source to Cloud Build staging bucket
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin"

# Cloud Run admin to deploy services
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.admin"

# Cloud Scheduler admin to update cron jobs
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudscheduler.admin"

# Service Account User to act as the Cloud Run runtime SA and Scheduler SA
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"
```

### Step 6: Bind GitHub Repository to the Service Account
Allow GitHub Actions workflows from your specific repository to impersonate the service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME/attribute.repository/$GITHUB_REPO"
```

### Step 7: Update `.github/workflows/deploy.yml`

Update `.github/workflows/deploy.yml` with the following keyless workflow:

```yaml
name: Deploy to GCP

on:
  push:
    branches:
      - master
      - main

permissions:
  contents: read
  id-token: write # Required for requesting the OIDC JWT token

jobs:
  test:
    name: Pre-deployment Verification
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Test Suite
        run: npm run test:ci

  deploy:
    name: Build & Deploy to Cloud Run
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # Keyless authentication via Workload Identity Federation
      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/${{ secrets.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
          service_account: '${{ secrets.GCP_SA_EMAIL }}'

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: dashboard-management-prod

      - name: Submit Cloud Build
        run: |
          gcloud builds submit --config=cloudbuild.yaml .
```

### Step 8: Clean Up Static Secrets
Once WIF authentication is confirmed operational:
1. Delete `GCP_SA_KEY` from GitHub Repository Settings -> Secrets and variables -> Actions.
2. Delete any local service account JSON keys from developer workstations.
