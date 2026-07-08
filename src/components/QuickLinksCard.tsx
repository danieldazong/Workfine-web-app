import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeUserLinks, UserLink } from "../lib/firebase/links";
import { normalizeUrl } from "../lib/linkPlatform";
import LinkAvatar from "./LinkAvatar";

// Dashboard grid card that shows the user's saved links in real time.
// Read-only display; management happens in Settings → Links.
export default function QuickLinksCard() {
  const { user } = useAuth();
  const [links, setLinks] = useState<UserLink[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUserLinks(user.uid, setLinks);
    return () => unsub();
  }, [user?.uid]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Quick Links</h3>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">
            Your saved shortcuts
          </p>
        </div>
        <span className="text-xs text-gray-400">{links.length}</span>
      </div>

      {links.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1">
          {links.map((l) => (
            <a
              key={l.id}
              href={normalizeUrl(l.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 py-2 px-2 border border-gray-100 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-colors min-w-0"
            >
              <LinkAvatar url={l.url} title={l.title} size={32} />
              <span className="text-xs font-medium text-gray-700 truncate">
                {l.title || l.url}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="h-[120px] flex flex-col items-center justify-center gap-1">
          <p className="text-xs text-gray-400">No links yet.</p>
          <p className="text-[10px] text-gray-400">
            Add links in Settings → Links
          </p>
        </div>
      )}
    </div>
  );
}
