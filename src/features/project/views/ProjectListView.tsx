/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from '../../../types';
import { cn, formatDate } from '../../../lib/utils';
import { 
  CheckCircle2, 
  Clock, 
  MessageSquare, 
  Paperclip,
  MoreHorizontal,
  Plus
} from 'lucide-react';

interface ProjectListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export default function ProjectListView({ tasks, onTaskClick }: ProjectListViewProps) {
    const sections: Array<"To Do" | "In Progress" | "In Review" | "Done"> = [
    "To Do",
    "In Progress",
    "In Review",
    "Done",
  ];


  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionTasks = tasks.filter(t => t.status === section);
        
        return (
          <div key={section} className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-slate-900 dark:text-white">{section}</h3>
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500">
                  {sectionTasks.length}
                </span>
              </div>
              <button className="text-muted-text hover:text-slate-600 dark:hover:text-slate-300">
                <MoreHorizontal size={18} />
              </button>
            </div>

            <div className="card divide-y dark:divide-gray-800 border-slate-100 shadow-sm overflow-hidden">
              {sectionTasks.map((task) => (
                <div 
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <button className={cn(
                      "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0",
                      task.status === 'Done' 
                        ? "bg-success border-success text-white" 
                        : "border-slate-200 dark:border-slate-700 hover:border-primary"
                    )}>
                      {task.status === 'Done' && <CheckCircle2 size={12} strokeWidth={4} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium tracking-tight truncate",
                        task.status === 'Done' ? "text-muted-text line-through" : "text-slate-900 dark:text-white"
                      )}>
                        {task.title}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-0 flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-text">
                        <MessageSquare size={14} />
                        <span>0</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-text">
                        <Paperclip size={14} />
                        <span>{task.attachments?.length || 0}</span>
                      </div>
                    </div>

                    <div className={cn(
                      "hidden md:flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full uppercase tracking-tighter",
                      task.priority === 'Urgent' ? 'bg-danger/10 text-danger' : 
                      task.priority === 'High' ? 'bg-amber-100 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    )}>
                      {task.priority}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 min-w-[100px] justify-end">
                      <Clock size={14} className={cn(task.dueDate && new Date(task.dueDate) < new Date() && "text-danger")} />
                      <span className={cn(task.dueDate && new Date(task.dueDate) < new Date() && "text-danger")}>
                        {formatDate(task.dueDate)}
                      </span>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      JS
                    </div>
                  </div>
                </div>
              ))}
              
              <button className="w-full p-3 text-left pl-12 text-sm text-muted-text hover:text-primary transition-colors flex items-center gap-2">
                <Plus size={16} />
                Add Task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
