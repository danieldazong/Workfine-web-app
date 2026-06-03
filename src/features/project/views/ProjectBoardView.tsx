/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useAppData } from '../../../context/AppDataContext';

type ProjectTaskStatus = "To Do" | "In Progress" | "In Review" | "Done";
import { cn, formatDate } from '../../../lib/utils';
import { 
  Plus, 
  MoreHorizontal, 
  MessageSquare, 
  Paperclip, 
  Clock,
  GripVertical
} from 'lucide-react';
import { motion } from 'motion/react';

interface ProjectBoardViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export default function ProjectBoardView({ tasks, onTaskClick }: ProjectBoardViewProps) {
  const { user } = useAuth();
  const appData = useAppData() as any;
  const members = Array.isArray(appData?.members) ? appData.members : [];
  const workspaceData = appData?.workspaceData;

  const myMembership = members.find((m: any) => {
    const memberUid = m?.userId || m?.uid || m?.id;
    return !!user?.uid && memberUid === user.uid;
  });

  const myRole = (
    workspaceData?.ownerId === user?.uid
      ? "owner"
      : String(myMembership?.role || "viewer").toLowerCase()
  ) as "owner" | "admin" | "member" | "viewer";

  // Members and viewers cannot add tasks.
  const canEditTasks =
    myRole === "owner" ||
    myRole === "admin" ||
    myMembership?.permissions?.canEdit === true ||
    myMembership?.permissions?.canManageTasks === true;

  const columns: ProjectTaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];


  return (
    <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide">
      {columns.map((status) => {
        const columnTasks = tasks.filter(t => t.status === status);
        
        return (
          <div key={status} className="flex-shrink-0 w-80 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white">{status}</h3>
                <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
                            <div className="flex items-center gap-1">
                {canEditTasks && (
                  <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 transition-colors">
                    <Plus size={16} />
                  </button>
                )}
                <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 transition-colors">
                  <MoreHorizontal size={16} />
                </button>
              </div>

            </div>

            <div className="flex-1 space-y-4 min-h-[300px]">
              {columnTasks.map((task, idx) => (
                <motion.div
                  key={task.id}
                  layoutId={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => onTaskClick(task)}
                  className="card p-4 hover:shadow-lg transition-all cursor-pointer group border-slate-100 hover:border-primary/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                      task.priority === 'Urgent' ? 'bg-danger/10 text-danger' : 
                      task.priority === 'High' ? 'bg-amber-100 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    )}>
                      {task.priority}
                    </div>
                    <button className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical size={14} />
                    </button>
                  </div>

                  <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-2 leading-snug line-clamp-2">
                    {task.title}
                  </h4>
                  
                  {task.description && (
                    <p className="text-xs text-muted-text mb-4 line-clamp-2 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50 dark:border-border-dark">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <MessageSquare size={12} />
                        <span>0</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Paperclip size={12} />
                        <span>{task.attachments?.length || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {task.dueDate && (
                        <div className={cn(
                          "flex items-center gap-1 text-[10px] font-bold",
                          new Date(task.dueDate) < new Date() ? "text-danger" : "text-slate-400"
                        )}>
                          <Clock size={12} />
                          <span>{formatDate(task.dueDate)}</span>
                        </div>
                      )}
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold border border-primary/10">
                        JS
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

                            {canEditTasks && (
                <button className="w-full p-4 border-2 border-dashed border-slate-200 dark:border-border-dark rounded-xl text-slate-400 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <Plus size={18} />
                  Add Task
                </button>
              )}

            </div>
          </div>
        );
      })}
    </div>
  );
}
