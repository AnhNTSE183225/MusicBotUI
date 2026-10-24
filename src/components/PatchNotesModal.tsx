import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, Calendar, CheckCircle2, Check, CheckCheck, RotateCcw, EyeOff, Bell } from 'lucide-react'
import { PATCH_NOTES, CURRENT_VERSION, type PatchNote, usePatchNotesReadState } from '@/data/patchNotes'
import logoIcon from '@/assets/logo_icon.svg'

export interface PatchNotesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatchNotesModal({ open, onOpenChange }: PatchNotesModalProps) {
  const { readVersions, unreadCount, isRead, markAsRead, markAsUnread, markAllAsRead, markAllAsUnread } = usePatchNotesReadState();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="patch-notes-dialog glass-surface max-w-xl max-h-[85vh] flex flex-col p-6 gap-4">
        <DialogHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2.5">
              <img src={logoIcon} alt="MusicBỏTúi" className="w-6 h-6 object-contain" />
              <DialogTitle className="text-lg font-semibold text-foreground">
                Release Notes
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full">
                  <Bell size={11} />
                  {unreadCount} Unread
                </span>
              )}
              <span className="text-[11px] font-semibold font-mono text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                v{CURRENT_VERSION} Latest
              </span>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            See what&apos;s new and track updates across versions.
          </DialogDescription>

          {/* Quick action controls for Mark all as read / unread */}
          <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/30">
            <span className="text-xs text-muted-foreground font-mono">
              {unreadCount === 0 ? 'All updates read' : `${unreadCount} of ${PATCH_NOTES.length} unread`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="h-7 text-xs px-2.5 border-border/60 hover:border-primary/40 text-foreground cursor-pointer"
                aria-label="Mark all as read"
              >
                <CheckCheck size={13} className="mr-1 text-primary" />
                Mark all as read
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={markAllAsUnread}
                disabled={unreadCount === PATCH_NOTES.length}
                className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Mark all as unread"
              >
                <RotateCcw size={12} className="mr-1" />
                Mark all as unread
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable list of version notes */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
          {PATCH_NOTES.map((patch: PatchNote, index: number) => {
            const isLatest = index === 0;
            const read = isRead(patch.version);
            return (
              <div
                key={patch.version}
                className={`p-4 rounded-xl border transition-all ${
                  !read
                    ? 'bg-card/80 border-primary/35 shadow-[0_0_15px_rgba(0,230,118,0.06)]'
                    : 'bg-card/35 border-border/50 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border">
                      v{patch.version}
                    </span>
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                      {patch.headline}
                      {isLatest && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/15 px-1.5 py-0.2 rounded-full border border-primary/25">
                          <Sparkles size={10} /> Latest
                        </span>
                      )}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-auto">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                      <Calendar size={11} />
                      <span>{patch.date}</span>
                    </div>

                    {/* Individual read/unread action button */}
                    {!read ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => markAsRead(patch.version)}
                        className="h-6 text-[11px] px-2 gap-1 border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
                        aria-label={`Mark v${patch.version} as read`}
                      >
                        <Check size={12} />
                        Mark as read
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => markAsUnread(patch.version)}
                        className="h-6 text-[11px] px-2 gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        aria-label={`Mark v${patch.version} as unread`}
                      >
                        <EyeOff size={12} />
                        Mark as unread
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed mb-3">
                  {patch.summary}
                </p>

                {patch.details && patch.details.length > 0 && (
                  <ul className="space-y-1.5 pt-1 border-t border-border/40">
                    {patch.details.map((detail, dIdx) => (
                      <li key={dIdx} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                        <CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />
                        <span className="leading-snug">{detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
