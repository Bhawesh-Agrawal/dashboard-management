import type { AIToolDefinition } from "@/lib/ai/openrouter";
import type { AssistantTool } from "./types";
import {
  getAcademicCalendarTool,
  getAttendanceTool,
  getCoursesTool,
  getScheduleTool,
  getTodayOverviewTool,
} from "./read-academic";
import {
  getDsaSummaryTool,
  getLatestBriefTool,
  getNoteTool,
  getProjectTool,
  listDeadlinesTool,
  listProjectsTool,
  listTasksTool,
  searchNotesTool,
} from "./read-workspace";
import {
  proposeCreateEventTool,
  proposeCreateTaskTool,
  proposeSaveNoteTool,
  proposeUpdateTaskTool,
} from "./write-proposals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAssistantTool = AssistantTool<any>;

export function getRegisteredTools(options: { dsaEnabled: boolean }): AnyAssistantTool[] {
  const tools: AnyAssistantTool[] = [
    getTodayOverviewTool,
    getScheduleTool,
    getAttendanceTool,
    getCoursesTool,
    getAcademicCalendarTool,
    listTasksTool,
    listDeadlinesTool,
    searchNotesTool,
    getNoteTool,
    listProjectsTool,
    getProjectTool,
    getLatestBriefTool,
    proposeCreateTaskTool,
    proposeUpdateTaskTool,
    proposeCreateEventTool,
    proposeSaveNoteTool,
  ];

  if (options.dsaEnabled) {
    tools.push(getDsaSummaryTool);
  }

  return tools;
}

export function toOpenAITools(tools: AnyAssistantTool[]): AIToolDefinition[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
