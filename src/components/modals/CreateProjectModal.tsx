/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2 } from 'lucide-react';
import { createProject } from '../../lib/firebase/projects';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const { user, workspaceId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const colors = [
    '#6366F1', // Indigo
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#EC4899', // Pink
    '#8B5CF6', // Violet
    '#14B8A6'  // Teal
  ];

  const handleLaunchProject = async () => {
    if (!name.trim()) {
      setSubmitError('Project name is required.');
      return;
    }
    if (!user) {
  setSubmitError("You must be signed in to create a project.");
  return;
}

if (!workspaceId) {
  setSubmitError("No active workspace found.");
  return;
}


    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createProject(
  workspaceId,
  {
    name,
    description,
    color,
    status: "active",
    priority: "Medium",
    dueDate: "",
  },
  user.uid
);


      // Reset form and close on success
      setName('');
      setDescription('');
      setColor('#6366F1');
      setIsSubmitting(false);
      onClose();
    } catch (error: any) {
      console.error('Create project error:', error);
      setSubmitError(
        error?.message ?? 'Failed to create project. Please try again.'
      );
      setIsSubmitting(false); // CRITICAL: always reset on error
    }
  };

  const handleClose = () => {
    if (isSubmitting) return; // prevent closing while submitting
    setSubmitError(null);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white border border-gray-200 rounded-3xl shadow-2xl z-[110] focus:outline-none animate-in zoom-in-95 duration-300 outline-none p-0 overflow-hidden">
          
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create New Project</h2>
                <p className="text-gray-500 text-sm mt-1">Organize your tasks and team effortlessly.</p>
              </div>
              <Dialog.Close
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors outline-none"
              >
                <X size={20} className="text-gray-400" />
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Marketing Campaign"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project about?"
                  className="w-full h-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-900 resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Theme Color</label>
                <div className="flex flex-wrap gap-3">
                  {colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all ring-offset-2',
                        color === c ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-105'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Error message */}
            {submitError && (
              <p className="text-red-500 text-sm text-center bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                {submitError}
              </p>
            )}

            <div className="pt-2 flex gap-3">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunchProject}
                disabled={isSubmitting || !name.trim()}
                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Creating...
                  </>
                ) : (
                  'Launch Project'
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
