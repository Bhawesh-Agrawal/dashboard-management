"use client";

import { deleteResource } from "@/features/library/lib/actions";
import { EditResourceDialog } from "./edit-resource-dialog";
import { ExternalLink } from "lucide-react";

type ResourceData = {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  tags: string[];
};

export function ResourceList({ resources }: { resources: ResourceData[] }) {
  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved resources yet. Add links, readings, and references.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {resources.map((resource) => (
        <ResourceRow key={resource.id} resource={resource} />
      ))}
    </div>
  );
}

function ResourceRow({ resource }: { resource: ResourceData }) {
  return (
    <div className="list-row items-start group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{resource.title}</span>
          {resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {resource.notes && (
          <p className="text-xs text-muted-foreground mt-0.5">{resource.notes}</p>
        )}
        {resource.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {resource.tags.map((tag) => (
              <span key={tag} className="text-[0.65rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
        <EditResourceDialog resource={resource} />
        <button
          onClick={() => deleteResource(resource.id)}
          className="p-1 rounded hover:bg-accent transition-colors text-destructive"
        >
          ×
        </button>
      </div>
    </div>
  );
}
