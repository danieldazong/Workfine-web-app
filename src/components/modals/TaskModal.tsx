/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, 
  Calendar, 
  Flag, 
  User as UserIcon, 
  AlignLeft, 
  Paperclip,
  CheckCircle2,
  Trash2,
  Send,
  Loader2,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
type TaskPriority = 'Urgent' | 'High' | 'Medium' | 'Low';

type TaskStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';

type Attachment = {
  id?: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
  uploadedAt?: any;
  uploadedBy?: string;
};

type Task = {
  id: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  projectId?: string;
  workspaceId?: string;
  assignee?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  dueDate?: any;
  sectionId?: string;
  attachments?: Attachment[];
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
};

import { taskService } from '../../lib/firebase/tasks';
import { storageService } from '../../lib/firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { cn, formatDate } from '../../lib/utils';
import { useAppData } from '../../context/AppDataContext';


interface TaskModalProps {
  task?: Task | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskModal({ task, projectId, isOpen, onClose }: TaskModalProps) {
  const { user, workspaceId } = useAuth();
    const appData = useAppData() as any;
  const members = Array.isArray(appData?.members) ? appData.members : [];
  const workspaceData = appData?.workspaceData;

  // GLOBAL role resolution — identical logic for every account.
  const myMembership = members.find((m: any) => {
    const memberUid = m?.userId || m?.uid || m?.id;
    return !!user?.uid && memberUid === user.uid;
  });

  const myRole = (
    workspaceData?.ownerId === user?.uid
      ? "owner"
      : String(myMembership?.role || "viewer").toLowerCase()
  ) as "owner" | "admin" | "member" | "viewer";

  // Members and viewers cannot create, edit, or delete tasks.
  const canEditTasks =
    myRole === "owner" ||
    myRole === "admin" ||
    myMembership?.permissions?.canEdit === true ||
    myMembership?.permissions?.canManageTasks === true;
   const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'Medium');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'To Do');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  // Assignee: defaults to the task's existing assignee, else the current user.
  const [assigneeId, setAssigneeId] = useState<string>(
    String(task?.assigneeId || user?.uid || '')
  );
  const [isUploading, setIsUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

   const handleSave = async () => {
    if (!title.trim() || !user || !workspaceId) return;
    if (!canEditTasks) {
      console.warn("[TaskModal] save blocked: insufficient role", myRole);
      onClose();
      return;
    }
    setSaving(true);

       try {
      // Resolve the picked assignee from the live members list so we store the
      // correct uid + email. Falls back to the current user when nothing chosen.
      const picked = (members as any[]).find(
        (m: any) => String(m?.userId || m?.uid || m?.id || '') === assigneeId
      );
      const finalAssigneeId = assigneeId || user.uid;
      const finalAssigneeEmail = String(
        picked?.email || picked?.emailLower || (assigneeId ? '' : user.email) || ''
      ).trim();
      const finalAssigneeName = String(
        picked?.displayName || picked?.name || (assigneeId ? '' : (user.displayName || user.email)) || ''
      ).trim();

      if (task) {
        await taskService.updateTask(task.id, {
          title,
          description,
          priority,
          status,
          dueDate,
          // Persist (re)assignment on edit too.
          assignee: finalAssigneeName,
          assigneeId: finalAssigneeId,
          assigneeIds: [finalAssigneeId],
          assigneeEmail: finalAssigneeEmail,
          assigneeEmails: finalAssigneeEmail ? [finalAssigneeEmail] : [],
        }, workspaceId);

      } else {
        await taskService.createTask({
          projectId,
          workspaceId,
          title: title.trim(),
          description: description.trim(),
          createdBy: user.uid,
          ownerId: user.uid,
          assignee: finalAssigneeName,
          assigneeId: finalAssigneeId,
          assigneeIds: [finalAssigneeId],
          assigneeEmail: finalAssigneeEmail,
          assigneeEmails: finalAssigneeEmail ? [finalAssigneeEmail] : [],
          dueDate: dueDate || null,
          priority,
          status,
          sectionId: status,
        });

      }
      onClose();
    } catch (error) {
      console.error('Error saving task', error);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
   if (!file || !user || !task || !workspaceId) return;


    setIsUploading(true);
    try {
      const attachment = await storageService.uploadFile(user.uid, projectId, task.id, file);
      await taskService.updateTask(task.id, {
  attachments: [...(task.attachments || []), attachment]
}, workspaceId);
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setIsUploading(false);
    }
  };

  const priorities: TaskPriority[] = ['Urgent', 'High', 'Medium', 'Low'];
  const statuses: TaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-blue-500/30 rounded-3xl shadow-2xl z-[110] focus:outline-none animate-in zoom-in-95 duration-300 overflow-hidden outline-none">
          
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-border-dark bg-slate-50/50 dark:bg-slate-800/20">
            <div className="flex items-center gap-2">
               <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  status === 'Done' ? "bg-success/10 text-success" : "bg-blue-500/10 text-blue-400"
               )}>
                 {task ? 'Edit Task' : 'New Task'}
               </div>
               <span className="text-slate-300">/</span>
               <span className="text-xs font-semibold text-muted-text">Project Core</span>
            </div>
            <Dialog.Close className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors outline-none">
              <X size={20} className="text-slate-500" />
            </Dialog.Close>
          </div>

          <div className="p-8 space-y-8">
            <div className="space-y-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Write a task title..."
                className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-slate-200 dark:placeholder:text-slate-700 tracking-tight dark:text-white"
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="space-y-4">
                                      <div className="flex items-center gap-4">
                     <div className="w-24 text-sm font-medium text-muted-text flex items-center gap-2">
                       <UserIcon size={16} /> Assignee
                     </div>
                     {(() => {
                       // The member currently selected (for the avatar swatch).
                       const sel = (members as any[]).find(
                         (m: any) => String(m?.userId || m?.uid || m?.id || '') === assigneeId
                       );
                       const seed =
                         String(sel?.email || sel?.emailLower || '').trim() ||
                         (assigneeId ? '' : (user?.email || user?.displayName || 'U')) ||
                         'U';
                       const initial =
                         (String(sel?.displayName || sel?.name || '').trim()[0] ||
                          (assigneeId ? '?' : (user?.displayName?.[0] || 'U')) ||
                          'U').toUpperCase();
                       return (
                         <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                           <div
                             className="w-5 h-5 rounded-full text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-black/5 select-none flex-shrink-0"
                             style={{ background: monogramGradient(seed), letterSpacing: "0.02em" }}
                           >
                             {initial}
                           </div>
                           <select
                             value={assigneeId}
                             onChange={(e) => setAssigneeId(e.target.value)}
                             disabled={!canEditTasks}
                             className="bg-transparent border-none outline-none text-xs font-semibold dark:text-white cursor-pointer disabled:cursor-not-allowed pr-1"
                           >
                             <option value="">Unassigned</option>
                             {(members as any[]).map((m: any) => {
                               const uid = String(m?.userId || m?.uid || m?.id || '');
                               const label =
                                 String(m?.displayName || m?.name || '').trim() ||
                                 String(m?.email || '').split('@')[0] ||
                                 'Member';
                               return (
                                 <option key={uid || label} value={uid}>
                                   {label}
                                 </option>
                               );
                             })}
                           </select>
                         </div>
                       );
                     })()}
                   </div>

                   <div className="flex items-center gap-4">
                     <div className="w-24 text-sm font-medium text-muted-text flex items-center gap-2">
                       <Calendar size={16} /> Due Date
                     </div>
                     <input 
                       type="date"
                       value={dueDate}
                       onChange={(e) => setDueDate(e.target.value)}
                       className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-3 py-1.5 text-xs font-semibold dark:text-white outline-none cursor-pointer"
                     />
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-4">
                     <div className="w-24 text-sm font-medium text-muted-text flex items-center gap-2">
                       <Flag size={16} /> Priority
                     </div>
                     <select 
                       value={priority}
                       onChange={(e) => setPriority(e.target.value as TaskPriority)}
                       className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-3 py-1.5 text-xs font-semibold dark:text-white outline-none cursor-pointer appearance-none min-w-[100px]"
                     >
                       {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                   </div>

                   <div className="flex items-center gap-4">
                     <div className="w-24 text-sm font-medium text-muted-text flex items-center gap-2">
                       <Loader2 size={16} /> Status
                     </div>
                     <select 
                       value={status}
                       onChange={(e) => setStatus(e.target.value as TaskStatus)}
                       className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-3 py-1.5 text-xs font-semibold dark:text-white outline-none cursor-pointer appearance-none min-w-[100px]"
                     >
                       {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                   </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                <AlignLeft size={18} />
                Description
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details about this task..."
                className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all resize-none"
              />
            </div>

            {task && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                    <Paperclip size={18} />
                    Attachments
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:bg-blue-500/5 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                    disabled={isUploading}
                  >
                    {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                    Upload File
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {task.attachments?.map((file, idx) => (
                    <a 
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-border-dark rounded-xl flex items-center gap-3 hover:border-primary/30 transition-all group"
                    >
                      <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Paperclip size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-text">
  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : "Unknown size"}
</p>

                      </div>
                    </a>
                  ))}
                  {(!task.attachments || task.attachments.length === 0) && (
                    <div className="col-span-2 py-8 text-center border-2 border-dashed border-slate-100 dark:border-border-dark rounded-2xl text-xs text-muted-text">
                      No documents attached yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-border-dark flex items-center justify-between">
                       {canEditTasks && (
              <button
                onClick={() => {
                  if (task && workspaceId) {
                    taskService.deleteTask(task.id, workspaceId).then(() => onClose());
                  }
                }}
                className="p-2 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-xl transition-all"
              >
                <Trash2 size={20} />
              </button>
            )}

            <div className="flex items-center gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
                            <button 
                onClick={handleSave}
                disabled={saving || !title.trim() || !canEditTasks}
                title={!canEditTasks ? "Your role does not permit editing tasks" : undefined}
                className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                {task ? 'Update Task' : 'Create Task'}
              </button>

            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function monogramGradient(seed: string): string {
  const s = String(seed || "?").trim().toLowerCase();

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (c + ((h1 << 5) - h1)) | 0;
    h2 = (c * 31 + ((h2 << 7) - h2)) | 0;
    h3 = (c * 17 + ((h3 << 3) - h3)) | 0;
  }

  const hue1 = Math.abs(h1) % 360;
  const hueGap = 25 + (Math.abs(h2) % 90);
  const hue2 = (hue1 + hueGap) % 360;

  const sat1 = 58 + (Math.abs(h2) % 28);
  const sat2 = 58 + (Math.abs(h3) % 28);
  const light1 = 48 + (Math.abs(h3) % 16);
  const light2 = 38 + (Math.abs(h1) % 14);
  const angle = Math.abs(h2 ^ h3) % 360;

  return `linear-gradient(${angle}deg, hsl(${hue1} ${sat1}% ${light1}%), hsl(${hue2} ${sat2}% ${light2}%))`;
}


function PlusIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
