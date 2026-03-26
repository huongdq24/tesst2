import fs from 'fs';

let code = fs.readFileSync('src/components/video-generation-workspace.tsx', 'utf8');

// 1. Add editingClipIndexRef near handleGenerateRef
if (!code.includes('editingClipIndexRef')) {
  code = code.replace(
    '  const handleGenerateRef = useRef<((isAutoBypass?: boolean) => Promise<void>) | null>(null);',
    '  const handleGenerateRef = useRef<((isAutoBypass?: boolean) => Promise<void>) | null>(null);\n  const editingClipIndexRef = useRef<number | null>(null);'
  );
}

// 2. Modify polling block
if (!code.includes('editingClipIndexRef.current = null; // Clear edit index')) {
  const oldPollingSuccess = `
            if (result.videoUrl) {
              setGeneratedVideoUrls(prev => [...prev, result.videoUrl!]);
              // Add clip to the project timeline
              setVideoProject(prev => [...prev, { url: result.videoUrl!, duration: videoDuration + 's' }]);
              setExtendingVideoUrl(null); // Clear extend mode after successful generation
              // Save to Firebase Storage → Firestore
              saveVideoToFirebase(result.videoUrl);
            }`;

  const newPollingSuccess = `
            if (result.videoUrl) {
              setGeneratedVideoUrls(prev => [...prev, result.videoUrl!]);
              // Add or replace clip to the project timeline
              setVideoProject(prev => {
                const editIdx = editingClipIndexRef.current;
                if (editIdx !== null) {
                  const newProject = [...prev];
                  newProject[editIdx] = { url: result.videoUrl!, duration: videoDuration + 's' };
                  return newProject;
                }
                return [...prev, { url: result.videoUrl!, duration: videoDuration + 's' }];
              });
              setExtendingVideoUrl(null); // Clear extend mode after successful generation
              editingClipIndexRef.current = null; // Clear edit index
              // Save to Firebase Storage → Firestore
              saveVideoToFirebase(result.videoUrl);
            }`;

  // Use a softer regex to match considering CRLF differences
  code = code.replace(/if\s*\(result\.videoUrl\)\s*\{[\s\S]*?saveVideoToFirebase\(result\.videoUrl\);\s*\}/, newPollingSuccess.trim());
}

// 3. Modify handleEditorSubmit
const oldHandleEditorSubmitPrefix = `  const handleEditorSubmit = async (params: VideoEditorSubmitParams) => {
    if (!editorClipUrl || !user || !userData?.geminiApiKey) return;
    
    let finalPrompt = params.prompt;
    if (params.selection && (params.tool === 'insert' || params.tool === 'remove')) {
      finalPrompt += \` [Apply to region: x=\${Math.round(params.selection.relativeX*100)}%, y=\${Math.round(params.selection.relativeY*100)}%, w=\${Math.round(params.selection.relativeW*100)}%, h=\${Math.round(params.selection.relativeH*100)}%]\`;
    }
    if (params.tool === 'camera' && params.cameraPrompt) {
      finalPrompt += \` [Camera: \${params.cameraPrompt}]\`;
    }

    resetWorkspaceForExtend();
    setPrompt(finalPrompt);
    setExtendingVideoUrl(editorClipUrl);
    setEditorClipUrl(null);
    setJobStatus('processing');
    setElapsedTime(0);
    setErrorDetails(null);
    setIsSaving(false);
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);

    try {
      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        referenceImageUris: undefined, // Veo 3 extension requires no images
        referenceVideoUri: editorClipUrl,`;

const newHandleEditorSubmitPrefix = `  const handleEditorSubmit = async (params: VideoEditorSubmitParams) => {
    if (!editorClipUrl || !user || !userData?.geminiApiKey) return;
    
    // Find index of the clip being edited
    const editIndex = videoProject.findIndex(c => c.url === editorClipUrl);
    const isEditMode = params.tool !== 'extend';

    let finalPrompt = params.prompt;
    if (params.selection && (params.tool === 'insert' || params.tool === 'remove')) {
      finalPrompt += \` [Apply to region: x=\${Math.round(params.selection.relativeX*100)}%, y=\${Math.round(params.selection.relativeY*100)}%, w=\${Math.round(params.selection.relativeW*100)}%, h=\${Math.round(params.selection.relativeH*100)}%]\`;
    }
    if (params.tool === 'camera' && params.cameraPrompt) {
      finalPrompt += \` [Camera: \${params.cameraPrompt}]\`;
    }

    resetWorkspaceForExtend();
    setPrompt(finalPrompt);
    
    if (isEditMode) {
      editingClipIndexRef.current = editIndex !== -1 ? editIndex : null;
      setExtendingVideoUrl(null);
    } else {
      editingClipIndexRef.current = null;
      setExtendingVideoUrl(editorClipUrl);
    }
    
    setEditorClipUrl(null);
    setJobStatus('processing');
    setElapsedTime(0);
    setErrorDetails(null);
    setIsSaving(false);
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);

    try {
      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        // If it's edit mode, we use the captured frame as image constraint instead of a video extension
        referenceImageUris: isEditMode && params.capturedFrameDataUrl ? [params.capturedFrameDataUrl] : undefined,
        referenceVideoUri: isEditMode ? undefined : editorClipUrl,`;

// Safe regex replace
const submitRegex = /const handleEditorSubmit = async \(params: VideoEditorSubmitParams\) => \{[\s\S]*?referenceVideoUri: editorClipUrl,/;
code = code.replace(submitRegex, newHandleEditorSubmitPrefix);


fs.writeFileSync('src/components/video-generation-workspace.tsx', code);
console.log("Updated handleEditorSubmit and polling success logic");
