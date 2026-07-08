import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import type { TaskAreaGroup } from "../../../../models/tasks/taskGrouping";
import Collapsible from "../../../components/ui/Collapsible.view";
import TaskRow from "../../../components/tasks/TaskRow.view";

interface Props {
  areaGroups: TaskAreaGroup[];
  onComplete: (id: string) => void;
  onOpen: (task: TaskWithTags) => void;
}

/**
 * Desktop's "All" screen: the same Area -> Project -> Task collapsible
 * hierarchy as mobile's All/Space/Project (groupTasksByAreaAndProject), with
 * TaskRow at the leaves instead of MobileTaskRow. Rows get an empty
 * `projects` list so TaskRow's own project pill stays off here -- it would
 * repeat the enclosing project header. No reorder support, matching the
 * flat non-project desktop views (drag-reorder is project-view only).
 */
export default function DesktopGroupedTaskList({ areaGroups, onComplete, onOpen }: Props) {
  return (
    <div>
      {areaGroups.map((areaGroup) => (
        <Collapsible key={areaGroup.key} label={areaGroup.label} color={areaGroup.color}>
          {areaGroup.projectGroups.map((projectGroup) => (
            <div key={projectGroup.key} style={styles.projectLevel}>
              <Collapsible label={projectGroup.label} color={projectGroup.color} count={projectGroup.tasks.length}>
                {projectGroup.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projects={[]}
                    onComplete={() => onComplete(task.id)}
                    onClick={() => onOpen(task)}
                  />
                ))}
              </Collapsible>
            </div>
          ))}
        </Collapsible>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  projectLevel: {
    paddingLeft: 16,
  },
};
