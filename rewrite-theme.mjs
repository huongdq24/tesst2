import fs from 'fs';

let code = fs.readFileSync('src/components/video-generation-workspace.tsx', 'utf8');

const returnStr = '  return (\n    <div className="flex flex-col flex-1';
const returnIdx = code.indexOf(returnStr);

if (returnIdx === -1) {
  throw new Error("Could not find return block");
} else {
  code = code.slice(0, returnIdx);
}

const newReturn = `  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-140px)] relative bg-white dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl">
      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={(url) => { if(libraryTarget === 'standard') setInputImageUrls(p=>[...p,url]); else if(libraryTarget==='before') setBeforeImageUrl(url); else setAfterImageUrl(url); setIsLibraryOpen(false); }}
        onVideoExtend={activateExtendMode}
      />
      <input ref={beforeFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'before')} disabled={isBusy} />
      <input ref={afterFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'after')} disabled={isBusy} />
      <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />

      {/* --- ERROR / LOADING OVERLAY --- */}
      {(jobStatus === 'processing' || errorDetails) && (
        <div className="absolute inset-0 z-50 bg-white/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          {jobStatus === 'processing' ? (
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-900/30 text-zinc-900 dark:text-white shadow-2xl">
              <Loader2 className="h-12 w-12 animate-spin text-teal-500" />
              <p className="text-sm font-medium">{t('workspace.video.loadingMessage') || 'Đang tạo video...'}</p>
              <div className="text-xs font-mono text-teal-700 bg-teal-50 px-3 py-1 rounded-full">{elapsedTime}s</div>
              {isSaving && <p className="text-xs text-teal-600">Đang lưu video...</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-500/30 text-zinc-900 dark:text-white max-w-lg text-center shadow-2xl">
              <X className="h-12 w-12 text-red-500" />
              <p className="font-semibold text-lg">Đã xảy ra lỗi</p>
              <p className="text-sm text-red-600 dark:text-red-200/80 whitespace-pre-wrap">{errorDetails}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="bg-white hover:bg-zinc-100" onClick={() => setErrorDetails(null)}>Đóng</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleGenerateRef.current?.(false)} disabled={(!prompt.trim() && inputMode==='standard')}>Thử lại</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- MAIN CANVAS (GALLERY) --- */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-40 w-full scrollbar-thin rounded-xl">
        {videoProject.length > 0 ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Video className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Dự án hiện tại</h2>
              <span className="text-xs font-medium text-teal-700 dark:text-teal-200 bg-teal-100 dark:bg-teal-500/20 px-2.5 py-1 rounded-full border border-teal-200 dark:border-teal-500/20">{videoProject.length} clips</span>
              
              <Button variant="ghost" size="sm" className="ml-auto text-zinc-500 hover:text-teal-600 hover:bg-teal-50 rounded-full px-4 border border-transparent" onClick={() => { setVideoProject([]); setGeneratedVideoUrls([]); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Dự án mới
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videoProject.map((clip, index) => (
                <div key={index} className="group flex flex-col gap-2">
                  <div 
                    className="relative w-full aspect-video bg-zinc-100 dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 hover:border-teal-500/50 transition-all cursor-pointer shadow-md hover:shadow-teal-900/10"
                    onClick={() => setEditorClipUrl(clip.url)}
                  >
                    <video src={clip.url} className="w-full h-full object-cover rounded-xl group-hover:scale-[1.03] transition-transform duration-700 ease-out" />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 rounded-xl pointer-events-none">
                      <div className="flex justify-between items-start pointer-events-auto">
                        <span className="bg-white/90 dark:bg-black/60 text-teal-700 dark:text-white/90 text-[10px] uppercase font-bold px-2.5 py-1 rounded shadow-sm">
                          Clip {index + 1}
                        </span>
                        <a href={clip.url} download onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7 bg-white/40 hover:bg-white/80 text-zinc-900 rounded-full backdrop-blur-sm">
                            <Download className="h-3 w-3" />
                          </Button>
                        </a>
                      </div>
                      
                      <div className="self-center pointer-events-auto" onClick={(e) => { e.stopPropagation(); setEditorClipUrl(clip.url); }}>
                        <div className="h-12 w-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-xl shadow-black/20 hover:bg-white/60 hover:scale-110">
                          <Play className="h-5 w-5 text-zinc-900 ml-1" />
                        </div>
                      </div>
                      
                      <p className="text-[11px] font-medium text-white line-clamp-1 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75 drop-shadow-md">{clip.duration}</p>
                    </div>
                  </div>
                  
                  {!videoModel.includes('veo-2') && index === videoProject.length - 1 && (
                    <Button 
                      variant="outline" 
                      className="w-full border-dashed border-zinc-300 dark:border-white/20 bg-transparent hover:bg-teal-50 hover:text-teal-700 text-zinc-500 h-9 text-xs rounded-xl transition-colors"
                      onClick={() => activateExtendMode(clip.url)}
                    >
                      <Plus className="mr-2 h-3 w-3" /> Tạo cảnh nối tiếp
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto text-center space-y-6 animate-in fade-in zoom-in-95 duration-700">
             <div className="relative group cursor-default">
               <div className="absolute inset-0 bg-teal-400/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
               <div className="relative h-24 w-24 bg-gradient-to-br from-teal-50 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 rounded-full flex items-center justify-center border border-teal-200 dark:border-teal-800 shadow-xl shadow-teal-500/10">
                  <Wand2 className="h-10 w-10 text-teal-500 animate-pulse" />
               </div>
             </div>
             <div>
               <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500">iGen +</h1>
               <p className="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">Không gian làm việc vô cực. Chỉ cần mô tả ý tưởng, AI sẽ kết xuất video chuẩn điện ảnh với độ phân giải lên đến 4k.</p>
             </div>
             
             {/* TEMPLATES GRID IN EMPTY STATE */}
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full mt-8 max-w-2xl px-4">
                {VIDEO_TEMPLATES.filter(t => t.id !== 'none').slice(0, 6).map(tmpl => (
                  <div 
                    key={tmpl.id}
                    onClick={() => { setInputMode('standard'); setSelectedTemplate(tmpl.id); setScriptDescription(tmpl.prompt); }}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 hover:border-teal-400/50 hover:bg-teal-50 dark:hover:bg-teal-900/10 p-3 sm:p-4 rounded-xl cursor-pointer text-left transition-all duration-300 group shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{tmpl.label}</p>
                      <ArrowRight className="h-3 w-3 text-zinc-400 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-[11px] text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 line-clamp-2 leading-relaxed">{tmpl.prompt}</p>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      {/* --- EXTEND ALERT --- */}
      {extendingVideoUrl && (
        <div className="absolute bottom-[110px] left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-teal-200 dark:border-teal-800 rounded-2xl p-2.5 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
           <div className="h-10 w-16 bg-zinc-100 rounded-lg overflow-hidden ring-1 ring-black/5 relative group">
             <video src={extendingVideoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
           </div>
           <div className="text-sm">
             <div className="flex items-center gap-2 mb-0.5">
               <div className="h-1.5 w-1.5 bg-teal-500 rounded-full animate-pulse"></div>
               <span className="font-semibold text-teal-700 dark:text-teal-400 text-xs uppercase tracking-wider">Đang nối tiếp clip</span>
             </div>
             <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Cảnh tiếp theo diễn ra thế nào?</span>
           </div>
           <Button variant="ghost" size="icon" onClick={() => { setExtendingVideoUrl(null); editingClipIndexRef.current = null; }} className="h-8 w-8 text-zinc-400 hover:text-zinc-700 rounded-full hover:bg-zinc-100 ml-2">
             <X className="h-4 w-4" />
           </Button>
        </div>
      )}

      {/* --- FLOATING BOTTOM INPUT BAR --- */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-white via-white/90 dark:from-black dark:via-black/90 to-transparent pointer-events-none flex justify-center z-40 pt-16">
        <div className="w-full max-w-4xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl pointer-events-auto flex flex-col overflow-visible transition-all">
          
          {/* AI Script Output Popover Content (If active) */}
          {prompt && inputMode === 'standard' && (
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 flex flex-col gap-2 rounded-t-2xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2 py-0.5 rounded text-center">✨ Kịch bản AI / Prompt</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-teal-600 rounded-full hover:bg-teal-50" onClick={() => setIsEditingScript(!isEditingScript)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-teal-600 rounded-full hover:bg-teal-50" onClick={handleCopy}><Copy className="h-3 w-3" /></Button>
                </div>
              </div>
              {isEditingScript ? (
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="text-xs bg-white dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 min-h-[60px] rounded-lg focus-visible:ring-teal-500/30 p-2.5" />
              ) : (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed max-h-[80px] overflow-y-auto scrollbar-thin font-medium">{prompt}</p>
              )}
            </div>
          )}

          {/* Before & After Upload Area (Expands if B/A mode) */}
          {inputMode === 'before-after' && (
            <div className="p-3 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 flex gap-3 rounded-t-2xl">
              <div 
                onClick={() => !beforeImageUrl && beforeFileInputRef.current?.click()}
                className={cn("flex-1 h-20 rounded-xl border-2 border-dashed flex items-center justify-center relative overflow-hidden transition-all cursor-pointer group bg-white dark:bg-black/30",
                 beforeImageUrl ? "border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]" : "border-zinc-200 hover:border-orange-300"
                )}
              >
                {isUploadingBefore ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> 
                : beforeImageUrl ? (
                   <>
                     <Image src={beforeImageUrl} alt="B" fill className="object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                     <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex transition-opacity items-center justify-center">
                       <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full shadow-lg" onClick={(e) => { e.stopPropagation(); setBeforeImageUrl(null); }}><X className="h-4 w-4" /></Button>
                     </div>
                     <span className="absolute bottom-1 left-2 text-[10px] font-bold text-white bg-black/50 backdrop-blur-md px-1.5 py-0.5 rounded shadow-sm">TRƯỚC</span>
                   </>
                ) : <div className="flex flex-col items-center justify-center group-hover:scale-105 transition-transform"><UploadCloud className="h-5 w-5 text-orange-400/70 mb-1"/><span className="text-[10px] text-zinc-500 font-medium">Tải Ảnh Trước</span></div>}
              </div>
              <div className="flex items-center text-zinc-400"><ArrowRight className="h-4 w-4" /></div>
              <div 
                onClick={() => !afterImageUrl && afterFileInputRef.current?.click()}
                className={cn("flex-1 h-20 rounded-xl border-2 border-dashed flex items-center justify-center relative overflow-hidden transition-all cursor-pointer group bg-white dark:bg-black/30",
                 afterImageUrl ? "border-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.1)]" : "border-zinc-200 hover:border-teal-300"
                )}
              >
                {isUploadingAfter ? <Loader2 className="h-4 w-4 animate-spin text-teal-500" /> 
                : afterImageUrl ? (
                   <>
                     <Image src={afterImageUrl} alt="A" fill className="object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                     <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex transition-opacity items-center justify-center">
                       <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full shadow-lg" onClick={(e) => { e.stopPropagation(); setAfterImageUrl(null); }}><X className="h-4 w-4" /></Button>
                     </div>
                     <span className="absolute bottom-1 left-2 text-[10px] font-bold text-white bg-black/50 backdrop-blur-md px-1.5 py-0.5 rounded shadow-sm">SAU</span>
                   </>
                ) : <div className="flex flex-col items-center justify-center group-hover:scale-105 transition-transform"><UploadCloud className="h-5 w-5 text-teal-500/60 mb-1"/><span className="text-[10px] text-zinc-500 font-medium">Tải Ảnh Tương lai</span></div>}
              </div>
            </div>
          )}

          {/* Main Input Row */}
          <div className="p-2 sm:p-2.5 flex items-end gap-2 relative">
            
            {/* Left Action Button (Toggle popover for attachments / mode) */}
            <Button 
               variant="ghost" 
               size="icon" 
               className={cn("h-11 w-11 shrink-0 rounded-xl transition-all", showImageUpload ? "bg-teal-50 text-teal-600 dark:bg-white/10 dark:text-white" : "hover:bg-zinc-100 text-zinc-500 bg-zinc-50 dark:bg-black/30")}
               onClick={() => setShowImageUpload(!showImageUpload)}
            >
              <Plus className={cn("h-5 w-5 transition-transform duration-300", showImageUpload && "rotate-45")} />
            </Button>

            {/* Attachment Popover */}
            {showImageUpload && (
              <div className="absolute bottom-[110%] left-0 mb-1 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl w-[280px] animate-in slide-in-from-bottom-2 z-50">
                <div className="flex items-center gap-2 mb-3 bg-zinc-100 dark:bg-black/40 p-1 rounded-lg">
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'standard' ? "bg-white text-teal-600 shadow-sm" : "text-zinc-500 hover:text-teal-600")} onClick={() => { setInputMode('standard'); }}>
                    Tiêu chuẩn
                  </Button>
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'before-after' ? "bg-white text-teal-600 shadow-sm" : "text-zinc-500 hover:text-teal-600")} onClick={() => { setInputMode('before-after'); }}>
                    Trước Sau
                  </Button>
                </div>
                
                {inputMode === 'standard' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ảnh tham chiếu</p>
                      <Button variant="link" size="sm" className="h-5 text-[10px] text-teal-500 px-0" onClick={() => setIsLibraryOpen(true)}>Mở thư viện</Button>
                    </div>
                    {inputImageUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {inputImageUrls.map(url => (
                          <div key={url} className="relative h-14 w-14 shrink-0 rounded-lg bg-zinc-100 overflow-hidden border border-zinc-200 group">
                            <Image src={url} alt="ref" fill className="object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRemoveImage(url); }}><X className="h-4 w-4 text-white" /></div>
                          </div>
                        ))}
                        <div className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-zinc-300 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 text-zinc-400 transition-colors" onClick={() => fileInputRef.current?.click()}><Plus className="h-4 w-4"/></div>
                      </div>
                    ) : (
                      <div className="h-20 w-full rounded-xl border border-dashed border-zinc-300 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 text-zinc-400 hover:text-teal-600 transition-colors" onClick={() => fileInputRef.current?.click()}>
                         <UploadCloud className="h-6 w-6 mb-1 opacity-70" />
                         <span className="text-[10px] font-medium">Tải ảnh tham chiếu</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Input Field */}
            <div className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl relative flex items-center focus-within:ring-1 focus-within:ring-teal-400/50 transition-all shadow-inner">
               <Textarea
                 value={scriptDescription}
                 onChange={(e) => setScriptDescription(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     if (scriptDescription.trim() && !isGeneratingScript) handleGenerateScript();
                   }
                 }}
                 placeholder={inputMode === 'standard' ? "Bạn muốn tạo gì? (Bấm ✨ AI sẽ viết kịch bản giúp bạn)" : "Tùy chọn: Nhập thêm yêu cầu chuyển đổi (VD: Phong cách Vintage...)"}
                 className="resize-none border-0 bg-transparent shadow-none text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 min-h-[44px] py-3 pl-3 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 scrollbar-none"
                 rows={1}
                 disabled={isBusy}
               />
               
               {/* AI Magic Wand inside the input */}
               <Button 
                 variant="ghost" 
                 size="icon" 
                 onClick={handleGenerateScript} 
                 disabled={isBusy || !scriptDescription.trim() || isGeneratingScript}
                 className={cn("absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg transition-all", isGeneratingScript ? "bg-teal-50 text-teal-500" : "hover:bg-zinc-200 text-zinc-400 hover:text-teal-500", (!scriptDescription.trim() && "opacity-50 grayscale"))}
                 title="Viết kịch bản bằng AI"
               >
                 {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
               </Button>
            </div>

            {/* Settings Popover Toggle */}
            <div className="relative group/settings">
              <Button 
                variant="outline" 
                size="sm" 
                className={cn("h-11 px-3 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all gap-1.5 hidden sm:flex bg-white hover:bg-zinc-50 text-zinc-600 hover:text-teal-600 shadow-sm")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                 <span className="text-xs font-semibold">{videoDuration}s</span>
                 <div className="h-3 w-px bg-zinc-300 rounded"></div>
                 <span className="text-[10px]">{aspectRatio === '16:9' ? 'L' : 'P'}</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="icon" 
                className={cn("h-11 w-11 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all sm:hidden bg-white shadow-sm hover:text-teal-600 text-zinc-600", showAdvancedSettings ? "bg-zinc-100" : "")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                 <span className="text-xs font-bold">⚙️</span>
              </Button>
              
              {showAdvancedSettings && (
                <div className="absolute right-0 bottom-[110%] mb-1 bg-white dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl w-[300px] p-4 animate-in slide-in-from-bottom-2 z-50 origin-bottom-right">
                   <p className="text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider">Thông số Video</p>
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1.5">
                         <Label className="text-[10px] text-zinc-500">KHUNG HÌNH</Label>
                         <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as '16:9' | '9:16')}>
                           <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                           <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                             <SelectItem value="16:9">Ngang 16:9</SelectItem>
                             <SelectItem value="9:16">Dọc 9:16</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                       <div className="space-y-1.5">
                         <Label className="text-[10px] text-zinc-500">ĐỘ PHÂN GIẢI</Label>
                         <Select value={outputResolution} onValueChange={setOutputResolution} disabled={videoModel.includes('veo-2')}>
                           <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                           <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                             <SelectItem value="720p">720p</SelectItem>
                             <SelectItem value="1080p">1080p</SelectItem>
                             <SelectItem value="4k">4k HDR</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-zinc-500">THỜI LƯỢNG MẶC ĐỊNH</Label>
                       <Select value={videoDuration} onValueChange={setVideoDuration}>
                         <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                         <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                           <SelectItem value="4">4 Giây (Tiết kiệm)</SelectItem>
                           <SelectItem value="6">6 Giây (Tiêu chuẩn)</SelectItem>
                           <SelectItem value="8">8 Giây (Tối đa)</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-zinc-500">CỐT LÕI AI</Label>
                       <Select value={videoModel} onValueChange={setVideoModel}>
                         <SelectTrigger className="h-9 text-xs bg-teal-50 dark:bg-black/40 border-teal-200 dark:border-white/10 text-teal-700 dark:text-teal-300 rounded-lg font-medium"><SelectValue /></SelectTrigger>
                         <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                           <SelectItem value="veo-3.1-generate-preview">Google Veo 3.1 Pro (Cao cấp)</SelectItem>
                           <SelectItem value="veo-3.1-fast-generate-preview">Veo 3.1 Fast (Nhanh)</SelectItem>
                           <SelectItem value="veo-2.0-generate-001">Veo 2.0 Legacy</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                   </div>
                </div>
              )}
            </div>

            {/* SEND BUTTON */}
            <Button 
              className={cn("h-11 w-11 sm:w-auto px-0 sm:px-5 shrink-0 rounded-xl font-bold shadow-md transition-all focus:ring-2 ring-teal-500/50 ring-offset-2 ring-offset-white active:scale-95", 
                isGenerateDisabled ? "bg-zinc-100 text-zinc-400" : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/40"
              )}
              onClick={() => handleGenerateRef.current?.(false)}
              disabled={isGenerateDisabled}
            >
              {isBusy ? <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin text-white" /> : (
                <>
                  <Video className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Tạo Video</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <VideoEditorModal 
        clipUrl={editorClipUrl || ''}
        isOpen={!!editorClipUrl}
        onClose={() => setEditorClipUrl(null)}
        onSubmit={handleEditorSubmit}
        isGenerating={jobStatus === 'processing'}
      />
    </div>
  );
}
`;

code = code + newReturn;

fs.writeFileSync('src/components/video-generation-workspace.tsx', code);
console.log("Applied white and turquoise theme to the Flow-Style layout");
