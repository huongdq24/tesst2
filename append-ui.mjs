import fs from 'fs';

let code = fs.readFileSync('src/components/video-generation-workspace.tsx', 'utf8');

// Insert BA_VIDEO_TEMPLATES
const target1 = "const [selectedTemplate, setSelectedTemplate] = useState('none');";
const insert1 = `
  const BA_VIDEO_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'interior', label: '🛋️ Nội thất', prompt: 'Video chuyển đổi mượt mà từ căn phòng thô ráp sang một không gian tuyệt đẹp, đầy đủ nội thất sang trọng với ánh sáng ấm áp.' },
    { id: 'makeover', label: '💄 Trang điểm', prompt: 'Sự biến đổi ngoạn mục từ khuôn mặt mộc tự nhiên sang phong cách trang điểm lộng lẫy, sắc nét, chuyển cảnh mượt mà.' },
    { id: 'restoration', label: '🛠️ Phục hồi', prompt: 'Từ một đồ vật gỉ sét, cũ nát lột xác kỳ diệu thành đồ vật sáng bóng mới tinh, phục hồi hoàn hảo từng góc cạnh.' },
    { id: 'landscape', label: '🌳 Cảnh quan', prompt: 'Sự thay đổi thời gian (timelapse) từ khu đất trống khô cằn thành một không gian sân vườn xanh mướt, ngập tràn sức sống.' },
    { id: 'architecture', label: '🏗️ Kiến trúc', prompt: 'Tiến độ xây dựng tua nhanh từ bãi đất trống trở thành một công trình kiến trúc hiện đại, hoành tráng phản chiếu ánh mặt trời.' },
  ];\n\n  `;

if (code.includes(target1) && !code.includes('BA_VIDEO_TEMPLATES')) {
  code = code.replace(target1, insert1 + target1);
}

// Insert Before-After Prompt UI near TabsContent closing
const target2Pattern = /\s*\{\/\* Arrow indicator between images \*\/\}[\s\S]*?<\/TabsContent>/;
const target2Match = code.match(target2Pattern);

if (target2Match) {
  const matchedStr = target2Match[0];
  const replacementStr = matchedStr.replace('</TabsContent>', `
                  {/* Before & After Idea / Prompt */}
                  <div className="space-y-3 pt-2">
                    <Label className="font-semibold text-xs">Mô tả hướng chuyển đổi (Tùy chọn)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {BA_VIDEO_TEMPLATES.filter(t => t.id !== 'none').map(tmpl => (
                        <button
                          key={tmpl.id}
                          onClick={(e) => { e.preventDefault(); setSelectedTemplate(tmpl.id); setScriptDescription(tmpl.prompt); }}
                          disabled={isBusy}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] xl:text-xs border transition-all hover:shadow-sm",
                            selectedTemplate === tmpl.id 
                              ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                              : "bg-background hover:bg-muted border-border text-muted-foreground"
                          )}
                        >
                          {tmpl.label}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Gợi ý ngữ cảnh cho AI. VD: Căn phòng biến đổi phong cách Vintage, màu trầm ấm..."
                      value={scriptDescription}
                      onChange={(e) => { setScriptDescription(e.target.value); setSelectedTemplate('none'); }}
                      rows={2}
                      disabled={isBusy}
                      className="resize-none text-xs"
                    />
                  </div>
                </TabsContent>`);
  
  code = code.replace(matchedStr, replacementStr);
}

fs.writeFileSync('src/components/video-generation-workspace.tsx', code);
console.log("Injected templates successfully");
