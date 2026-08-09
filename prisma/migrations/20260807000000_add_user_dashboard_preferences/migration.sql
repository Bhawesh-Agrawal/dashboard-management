-- CreateTable
CREATE TABLE "user_dashboard_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "widget_order" JSONB NOT NULL DEFAULT '[]',
    "hidden_widgets" TEXT[] NOT NULL DEFAULT '{}',
    "accent_color" TEXT,
    "theme_mode" TEXT NOT NULL DEFAULT 'light',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_dashboard_preferences_user_id_key" ON "user_dashboard_preferences"("user_id");
