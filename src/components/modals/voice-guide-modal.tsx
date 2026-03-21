'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VoiceGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceGuideModal({ open, onOpenChange }: VoiceGuideModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            📖 Hướng dẫn Nhân bản & Kiểm soát Giọng nói
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6 text-sm text-foreground/90">
            {/* Step 1 */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-primary">🛑 1. Quy tắc vàng khi Nhân bản (Clone) Giọng nói</h3>
              <p>Chất lượng của giọng nói sau khi nhân bản phụ thuộc hoàn toàn vào Tệp Âm Thanh gốc mà bạn nạp vào. Hãy đảm bảo File âm thanh của bạn đáp ứng 3 tiêu chí:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Thời lượng:</strong> Tối thiểu 10 giây (Tốt nhất là từ 1 đến 3 phút để AI học được ngữ điệu).</li>
                <li><strong className="text-foreground">Độ trong:</strong> Hoàn toàn KHÔNG có tiếng ồn nền (tiếng quạt, tiếng gió, tiếng nhạc nền).</li>
                <li><strong className="text-foreground">Tính độc thoại:</strong> Chỉ có ĐÚNG 1 giọng người nói duy nhất trong audio. Định dạng .mp3, .wav, hoặc file video .mp4.</li>
              </ul>
            </section>

            {/* Step 2 */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-primary">👩‍💻 2. Cách thêm giọng nói mới</h3>
              <ul className="list-decimal pl-5 space-y-2 text-muted-foreground">
                <li>Bấm nút <strong className="text-foreground">+ Thêm giọng nói mới</strong> để mở công cụ.</li>
                <li>Tải tệp âm thanh/video lên HOẶC dùng chức năng <strong className="text-foreground">Ghi âm trực tiếp</strong> đọc một đoạn văn bản khoảng 10 giây.</li>
                <li>Đặt tên, viết ghi chú và bấm <strong className="text-foreground">Xác nhận tạo</strong>. AI trên đám mây sẽ xử lý ngay lập tức!</li>
              </ul>
            </section>

            {/* Step 3 */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-primary">💡 3. Mẹo đỉnh cao để điều khiển AI đọc chuẩn</h3>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-500">⭐ Thủ thuật: Viết Phiên Âm Tiếng Anh</p>
                <p className="text-amber-700 dark:text-amber-400">
                  Khi AI đọc Tiếng Việt rất hay, thì các từ Tiếng Anh xen kẽ thường bị lơ lớ do khác hệ bảng chữ. Giải pháp tốt nhất 100% người trong ngành sử dụng là:
                </p>
                <ul className="list-none space-y-1 text-amber-700/80 dark:text-amber-400/80 mt-2">
                  <li>➔ Luôn chọn ngôn ngữ là <strong className="text-amber-900 dark:text-amber-300">Chỉ đọc Tiếng Việt</strong>.</li>
                  <li>➔ Cố tình gõ từ tiếng anh thành tiếng việt: <br />Ví dụ thay vì nhập <code>"App iGen có tính năng Livestream"</code><br /> Hãy nhập thành <code>"Áp Ai-gien có tính năng Lai-sờ-trym"</code>.</li>
                </ul>
              </div>

              <div className="bg-primary/5 border border-primary/10 p-4 rounded-lg space-y-2 mt-4">
                <p className="font-medium text-primary">⭐ Cách đọc & Tốc độ</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Sử dụng chọn lựa <strong className="text-foreground">Cách đọc / Cảm xúc</strong> để ra lệnh ngầm cho AI điều chỉnh tông giọng vui vẻ, buồn bã, hay nghiêm túc tin tức.</li>
                  <li>Sử dụng <strong className="text-foreground">Thanh trượt Tốc độ</strong> (0.7x chậm ➔ 1.2x tốc độ cao) thay vì tăng tốc thủ công bằng phần mềm edit video để giữ nguyên được âm sắc mượt mà.</li>
                </ul>
              </div>
            </section>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
