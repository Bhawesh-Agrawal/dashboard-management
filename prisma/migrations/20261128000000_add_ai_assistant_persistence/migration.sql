-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'tool');

-- AlterTable: additive AI assistant preferences
ALTER TABLE "user_dashboard_preferences"
ADD COLUMN "assistant_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "assistant_dsa_access" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ai_daily_token_cap" INTEGER NOT NULL DEFAULT 200000;

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "sources" JSONB,
    "proposals" JSONB,
    "usage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_user_id_created_at_idx" ON "ai_messages"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
