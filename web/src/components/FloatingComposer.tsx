import { useRef, useState } from "react";
import { ArrowRight, Paperclip } from "lucide-react";

interface FloatingComposerProps {
  onSend: (text: string) => Promise<void>;
  onAttachFile: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function FloatingComposer({ onSend, onAttachFile, disabled }: FloatingComposerProps) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || disabled) return;
    setText("");
    await onSend(clean);
  };

  return (
    <div className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-20 flex justify-center px-4 md:bottom-6 md:left-60">
      <div className="flex w-full max-w-2xl items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".txt,.eml,.json,.ics"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              e.target.value = "";
              void onAttachFile(f);
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Attach file or notice"
          title="Attach notice or file"
          className="pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#A8B0B8]/30 bg-[#1A1C20] text-[#D6DCE2] shadow-xl transition-transform duration-150 hover:-translate-y-0.5 hover:border-[#F4F6F8] hover:text-[#F4F6F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8] active:scale-95 disabled:opacity-50"
        >
          <Paperclip className="h-[19px] w-[19px]" />
        </button>

        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto flex flex-1 items-center gap-2 rounded-full border border-[#A8B0B8]/30 bg-[#1A1C20]/95 py-1.5 pl-5 pr-1.5 shadow-2xl backdrop-blur-md transition-colors focus-within:border-[#F4F6F8]"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask Annie to handle something..."
            aria-label="Message Annie"
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#F4F6F8] placeholder-[#A8B0B8] outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F6F8] text-[#0D0E11] transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8] active:scale-95 disabled:opacity-40"
          >
            <ArrowRight className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );
}
