// ════════════════════════════════════════════════════════════════════════════
// Auto Video Gen — Web Studio Application Logic
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  // ── Elements ─────────────────────────────────────────────────────────────
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // Tab 1: URL
  const inputArticleUrl = document.getElementById("inputArticleUrl");
  const btnExtractUrl = document.getElementById("btnExtractUrl");
  const extractedCard = document.getElementById("extractedCard");
  const extractedThumb = document.getElementById("extractedThumb");
  const extractedThumbWrapper = document.getElementById("extractedThumbWrapper");
  const extractedDomain = document.getElementById("extractedDomain");
  const extractedTitle = document.getElementById("extractedTitle");
  const extractedSnippet = document.getElementById("extractedSnippet");
  const selectVoiceUrl = document.getElementById("selectVoiceUrl");
  const inputChannelUrl = document.getElementById("inputChannelUrl");
  const btnSubmitUrl = document.getElementById("btnSubmitUrl");

  // Tab 2: Text
  const inputTextTitle = document.getElementById("inputTextTitle");
  const inputTextBody = document.getElementById("inputTextBody");
  const selectVoiceText = document.getElementById("selectVoiceText");
  const inputChannelText = document.getElementById("inputChannelText");
  const btnSubmitText = document.getElementById("btnSubmitText");

  // Tab 3: Script
  const inputScriptJson = document.getElementById("inputScriptJson");
  const btnLoadSampleScript = document.getElementById("btnLoadSampleScript");
  const btnSubmitCustomScript = document.getElementById("btnSubmitCustomScript");

  // Library & Preview
  const btnRefreshVideos = document.getElementById("btnRefreshVideos");
  const videoGrid = document.getElementById("videoGrid");
  const videoCountBadge = document.getElementById("videoCountBadge");
  const btnOpenStudioPreview = document.getElementById("btnOpenStudioPreview");

  // Progress Modal
  const progressModal = document.getElementById("progressModal");
  const progressModalTitle = document.getElementById("progressModalTitle");
  const progressJobId = document.getElementById("progressJobId");
  const progressStepText = document.getElementById("progressStepText");
  const progressPercent = document.getElementById("progressPercent");
  const progressBarFill = document.getElementById("progressBarFill");
  const stepsChecklist = document.getElementById("stepsChecklist");
  const logsConsole = document.getElementById("logsConsole");
  const logsToggle = document.getElementById("logsToggle");
  const modalFooter = document.getElementById("modalFooter");
  const btnCloseProgressModal = document.getElementById("btnCloseProgressModal");
  const btnViewResultVideo = document.getElementById("btnViewResultVideo");

  // Player Modal
  const playerModal = document.getElementById("playerModal");
  const activeVideoPlayer = document.getElementById("activeVideoPlayer");
  let activePlayerSlug = null;
  const playerModalTitle = document.getElementById("playerModalTitle");
  const playerVideoTitle = document.getElementById("playerVideoTitle");
  const playerVideoMeta = document.getElementById("playerVideoMeta");
  const playerCaptionBox = document.getElementById("playerCaptionBox");
  const btnCopyCaption = document.getElementById("btnCopyCaption");
  const btnDownloadMp4 = document.getElementById("btnDownloadMp4");
  const btnDownloadMp3 = document.getElementById("btnDownloadMp3");
  const btnOpenInStudio = document.getElementById("btnOpenInStudio");
  const btnClosePlayerModal = document.getElementById("btnClosePlayerModal");

  // Toast
  const toastNotification = document.getElementById("toastNotification");
  const toastMessage = document.getElementById("toastMessage");

  let currentActiveJob = null;
  let activeEventSource = null;
  let currentExtractedData = null;

  // ── Toast Notification Helper ────────────────────────────────────────────
  function showToast(msg) {
    toastMessage.textContent = msg;
    toastNotification.classList.add("show");
    setTimeout(() => {
      toastNotification.classList.remove("show");
    }, 3500);
  }

  // ── Tab Switching ────────────────────────────────────────────────────────
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const button = e.currentTarget || btn;
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      button.classList.add("active");
      const tabKey = button.dataset.tab;
      const targetPane = document.getElementById(`pane${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Global ESC key to close any open modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePlayerModal();
      closeProgressModal();
    }
  });

  // ── Extract URL Information ──────────────────────────────────────────────
  btnExtractUrl.addEventListener("click", async () => {
    const url = inputArticleUrl.value.trim();
    if (!url || !url.startsWith("http")) {
      showToast("Vui lòng nhập đường dẫn hợp lệ bắt đầu bằng http:// hoặc https://");
      inputArticleUrl.focus();
      return;
    }

    currentExtractedData=null;extractedCard.style.display="none";
    btnSubmitUrl.disabled=true;
    btnExtractUrl.disabled = true;
    btnExtractUrl.innerHTML = `<span class="modal-spinner" style="width:14px;height:14px;border-width:2px;"></span> Đang đọc...`;

    try {
      const res = await fetch("/api/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể quét dữ liệu từ URL");

      currentExtractedData = {...data,url};
      extractedDomain.textContent = data.domain || "website";
      extractedTitle.textContent = data.title || url;
      document.getElementById('extractedScope').textContent = data.sourceScope ? `Nguồn: ${data.sourceScope.replace(/[.。]+$/, "")}${data.sections?.length ? ` · ${data.sections.length} đề mục` : ""}.` : '';
      extractedSnippet.textContent = data.content ? data.content.slice(0, 160) + "..." : "Đã đọc nội dung thành công.";

      if (data.ogImage) {
        extractedThumb.src = data.ogImage;
        extractedThumbWrapper.style.display = "block";
      } else {
        extractedThumbWrapper.style.display = "none";
      }

      extractedCard.style.display = "flex";
      showToast("Đã trích xuất thông tin bài báo thành công!");
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSubmitUrl.disabled=false;
      btnExtractUrl.disabled = false;
      btnExtractUrl.innerHTML = `<span>Quét Dữ Liệu</span>`;
    }
  });

  // ── Start Pipeline From URL ──────────────────────────────────────────────
  btnSubmitUrl.addEventListener("click", async () => {
    const url = inputArticleUrl.value.trim();
    if (!url || !url.startsWith("http")) {
      showToast("Vui lòng nhập URL bài viết hợp lệ");
      return;
    }

    const selectPresetUrl = document.getElementById("selectPresetUrl");
    const selectCaptionStyleUrl = document.getElementById("selectCaptionStyleUrl");
    const checkUseOgImageUrl = document.getElementById("checkUseOgImageUrl");

    btnSubmitUrl.disabled = true;
    const oldBtnText = btnSubmitUrl.innerHTML;
    btnSubmitUrl.innerHTML = `<span class="modal-spinner" style="width:14px;height:14px;border-width:2px;"></span> Đang xử lý...`;

    try {
      if (!currentExtractedData || currentExtractedData.url !== url) {
        const res = await fetch("/api/extract-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data=await res.json();
        if(!res.ok)throw new Error(data.error||'Không thể đọc nội dung nguồn.');
        currentExtractedData={...data,url};
      }

      const payload = {
        url,
        title: currentExtractedData?.title || url,
        content: currentExtractedData?.content || "",
        image: currentExtractedData?.ogImage || null,
        domain: currentExtractedData?.domain || "web",
        channel: inputChannelUrl.value.trim() || "DevPeek36",
        voiceId: selectVoiceUrl.value,
        voiceProvider: "edge-tts",
        preset: selectPresetUrl?.value || "news_45",
        captions: {
          enabled: true,
          style: selectCaptionStyleUrl?.value || "tiktok-bold",
        },
        useOgImage: checkUseOgImageUrl?.checked || false,
      };

      await window.Studio.prepare(payload, launchPipeline);
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSubmitUrl.disabled = false;
      btnSubmitUrl.innerHTML = oldBtnText;
    }
  });

  // ── Start Pipeline From Custom Text ──────────────────────────────────────
  btnSubmitText.addEventListener("click", async () => {
    const title = inputTextTitle.value.trim();
    const content = inputTextBody.value.trim();

    if (!title) {
      showToast("Vui lòng nhập tiêu đề bản tin");
      inputTextTitle.focus();
      return;
    }
    if (!content) {
      showToast("Vui lòng nhập nội dung chi tiết");
      inputTextBody.focus();
      return;
    }

    const payload = {
      title,
      content,
      channel: inputChannelText.value.trim() || "DevPeek36",
      voiceId: selectVoiceText.value,
      voiceProvider: "edge-tts",
    };

    btnSubmitText.disabled = true;
    try { await window.Studio.prepare(payload, launchPipeline); } catch (err) { showToast(err.message); }
    finally { btnSubmitText.disabled = false; }
  });

  // ── Load Sample Script ───────────────────────────────────────────────────
  btnLoadSampleScript.addEventListener("click", () => {
    const sample = {
      version: "1.0",
      metadata: {
        title: "Apple ra mắt chip AI thế hệ mới",
        source: { url: "local", domain: "apple.com", image: null },
        channel: "DevPeek36",
      },
      voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.2, settingsSource:"script", pronunciation:"smart" },
      scenes: [
        {
          id: "hook",
          type: "hook",
          voiceText: "Apple vừa chính thức công bố dòng chip ây ai thế hệ mới với hiệu năng cực khủng!",
          templateData: { template: "hook", headline: "Apple Chip M5 AI", subhead: "Hiệu năng cực khủng!", kenBurns: "zoom-in" },
        },
        {
          id: "body-1",
          type: "body",
          voiceText: "Sức mạnh xử lý tác vụ trí tuệ nhân tạo tăng gấp đôi so với thế hệ tiền nhiệm.",
          templateData: { template: "stat-hero", value: "2X", label: "Tốc Độ AI", context: "Gấp đôi thế hệ tiền nhiệm" },
        },
        {
          id: "body-2",
          type: "body",
          voiceText: "Tiết kiệm ba mươi phần trăm điện năng, hỗ trợ chạy mô hình ngôn ngữ lớn ngay trên thiết bị.",
          templateData: {
            template: "feature-list",
            title: "Ưu Điểm Nổi Bật",
            bullets: ["Tiết kiệm 30% pin", "Chạy LLM offline", "Bảo mật tuyệt đối"],
            icon: "spark",
          },
        },
        {
          id: "body-3",
          type: "body",
          voiceText: "Sản phẩm dự kiến sẽ được tích hợp trên các dòng máy cao cấp vào cuối năm nay.",
          templateData: { template: "callout", statement: "Tích hợp trên các dòng máy cao cấp cuối năm nay.", tag: "Thời Điểm" },
        },
        {
          id: "outro",
          type: "outro",
          voiceText: "Theo dõi DevPeek36 để xem bản tin mới mỗi ngày.",
          templateData: { template: "outro", ctaTop: "Xem bản tin mới mỗi ngày", channelName: "DevPeek36", source: "Nguồn: apple.com" },
        },
      ],
    };
    inputScriptJson.value = JSON.stringify(sample, null, 2);
    showToast("Đã nạp kịch bản mẫu vào trình soạn thảo!");
  });

  // ── Start Pipeline From Custom Script ────────────────────────────────────
  btnSubmitCustomScript.addEventListener("click", async () => {
    const raw = inputScriptJson.value.trim();
    if (!raw) {
      showToast("Vui lòng nhập nội dung JSON hoặc bấm 'Nạp Kịch Bản Mẫu'");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      parsed.templatePack='reference';parsed.visualStyle='tech-editorial';parsed.motionPreset='calm';
      parsed.creative={presetId:'reference',...parsed.creative};parsed.captions={enabled:true,style:'minimal',highlightMode:'estimated',...parsed.captions};
      await window.Studio.reviewImported(parsed, launchPipeline);
    } catch (err) {
      showToast(`Lỗi cú pháp JSON: ${err.message}`);
    }
  });

  // ── Launch Pipeline Core Function ────────────────────────────────────────
  async function launchPipeline(payload) {
    openProgressModal();

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể khởi động render video");

      currentActiveJob = data;
      progressJobId.textContent = data.slug;
      listenToJobProgress(data.jobId);
    } catch (err) {
      updateProgressStep(0, 8, `Lỗi: ${err.message}`, true);
      addLogLine(`[LỖI] ${err.message}`);
      showToast(`Không thể tạo video: ${err.message}`);
    }
  }

  // ── SSE Progress Listener ────────────────────────────────────────────────
  function listenToJobProgress(jobId) {
    if (activeEventSource) {
      activeEventSource.close();
    }

    activeEventSource = new EventSource(`/api/progress/${jobId}`);

    activeEventSource.addEventListener("initial", (e) => {
      const d = JSON.parse(e.data);
      if (d.logs && d.logs.length) {
        logsConsole.innerHTML = "";
        d.logs.forEach(addLogLine);
      }
      if (d.step) updateProgressStep(d.step, d.totalSteps || 8, d.stepMessage || "");
      if (d.status === "completed") { handleJobSuccess(d); activeEventSource.close(); }
      if (d.status === "failed") {
        updateProgressStep(0, 8, `Render thất bại: ${d.error || 'Hãy thử lại'}`, true);
        activeEventSource.close();
      }
    });

    activeEventSource.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      updateProgressStep(d.step, d.totalSteps, d.stepMessage);
      if (d.log) addLogLine(d.log);
    });

    activeEventSource.addEventListener("completed", (e) => {
      const d = JSON.parse(e.data);
      handleJobSuccess(d);
      activeEventSource.close();
    });

    activeEventSource.addEventListener("failed", (e) => {
      const d = JSON.parse(e.data);
      updateProgressStep(0, 8, `Render thất bại: ${d.error}`, true);
      addLogLine(`[LỖI THẤT BẠI] ${d.error}`);
      activeEventSource.close();
    });

    activeEventSource.onerror = () => {
      // Stream closed or error
    };
  }

  function handleJobSuccess(data) {
    updateProgressStep(8, 8, "Hoàn tất! Video đã sẵn sàng xem.");
    progressModalTitle.textContent = "🎉 Video Đã Render Thành Công!";
    modalFooter.style.display = "flex";
    showToast("🎉 Video ngắn của bạn đã tạo thành công!");
    fetchVideoList();

    btnViewResultVideo.onclick = () => {
      closeProgressModal();
      openPlayerModal({
        slug: currentActiveJob?.slug,
        title: currentActiveJob?.title || currentActiveJob?.slug,
        videoUrl: data.videoUrl,
        caption: data.caption,
      });
    };
  }

  // ── Progress UI Helpers ──────────────────────────────────────────────────
  function openProgressModal() {
    progressModal.style.display = "flex";
    modalFooter.style.display = "none";
    progressModalTitle.textContent = "Đang Tạo Video...";
    progressPercent.textContent = "10%";
    progressBarFill.style.width = "10%";
    logsConsole.innerHTML = '<div class="log-line text-muted">Đang khởi tạo các tiến trình...</div>';

    // Reset checklist
    document.querySelectorAll(".step-row").forEach((row) => {
      row.classList.remove("active", "completed");
    });
  }

  function closeProgressModal() {
    progressModal.style.display = "none";
  }

  btnCloseProgressModal.addEventListener("click", closeProgressModal);

  function updateProgressStep(step, total, msg, isError = false) {
    if (isError) {
      progressStepText.textContent = msg;
      progressStepText.style.color = "#f87171";
      return;
    }

    const pct = Math.min(100, Math.round((step / total) * 100));
    progressPercent.textContent = `${pct}%`;
    progressBarFill.style.width = `${pct}%`;
    progressStepText.textContent = `Bước ${step}/${total}: ${msg}`;
    progressStepText.style.color = "#c7d2fe";

    // Update checklist UI
    document.querySelectorAll(".step-row").forEach((row) => {
      const rowStep = parseInt(row.dataset.step, 10);
      if (rowStep < step) {
        row.classList.remove("active");
        row.classList.add("completed");
      } else if (rowStep === step) {
        row.classList.remove("completed");
        row.classList.add("active");
      } else {
        row.classList.remove("active", "completed");
      }
    });
  }

  function addLogLine(text) {
    const div = document.createElement("div");
    div.className = "log-line";
    div.textContent = text;
    logsConsole.appendChild(div);
    logsConsole.scrollTop = logsConsole.scrollHeight;
  }

  logsToggle.addEventListener("click", () => {
    logsConsole.style.display = logsConsole.style.display === "none" ? "block" : "none";
  });

  // ── Video Library ────────────────────────────────────────────────────────
  async function fetchVideoList() {
    try {
      const res = await fetch("/api/videos");
      const list = await res.json();
      renderVideoGrid(list);
    } catch (err) {
      console.error("Failed to fetch videos", err);
    }
  }

  function renderVideoGrid(videos) {
    videoCountBadge.textContent = `${videos.length} Video`;

    if (!videos || videos.length === 0) {
      videoGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎬</span>
          <p>Chưa có video nào trong thư mục output. Hãy tạo video đầu tiên của bạn ở trên!</p>
        </div>
      `;
      return;
    }

    videoGrid.innerHTML = "";
    videos.forEach((vid) => {
      const card = document.createElement("div");
      card.className = "video-card glass-card";

      const hasMp4 = vid.hasVideo && vid.videoUrl;

      card.innerHTML = `
        <div class="video-thumb-container" data-slug="${vid.slug}">
          ${hasMp4 ? `
            <img class="video-preview-player" src="${escapeHtml(vid.thumbnailUrl || `/api/videos/${encodeURIComponent(vid.slug)}/thumbnail`)}" alt="Thumbnail ${escapeHtml(vid.title)}" loading="lazy" decoding="async" width="1080" height="1920">
            <div class="video-play-overlay">
              <div class="play-icon-circle">▶</div>
            </div>
            <div class="video-badge-duration">${vid.videoSizeMb}MB</div>
          ` : `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:0.85rem;">
              Chưa có video MP4
            </div>
          `}
        </div>
        <div class="video-card-body">
          <h4 class="video-card-title">${escapeHtml(vid.title)}</h4>
          <div class="video-card-meta">
            ${new Date(vid.mtime).toLocaleDateString("vi-VN")} · ${vid.sceneCount} cảnh
          </div>
          <div class="video-card-actions">
            ${hasMp4 ? `
              <button class="btn btn-sm btn-primary btn-play-card" style="flex:1;">
                <span>▶ Phát Video</span>
              </button>
              <a href="/api/videos/${vid.slug}/download" download="${vid.slug}.mp4" class="btn btn-sm btn-outline btn-download-card" title="Tải file video MP4 về máy">
                <span>⬇️ Tải MP4</span>
              </a>
            ` : ""}
            <button class="btn btn-sm btn-outline btn-delete-card" title="Xóa video này">
              <span>🗑️</span>
            </button>
          </div>
        </div>
      `;

      // Event listeners for card
      const thumb = card.querySelector(".video-thumb-container");
      const playBtn = card.querySelector(".btn-play-card");
      const deleteBtn = card.querySelector(".btn-delete-card");

      const handleOpen = () => openPlayerModal(vid);

      if (thumb && hasMp4) thumb.addEventListener("click", handleOpen);
      if (playBtn) playBtn.addEventListener("click", handleOpen);

      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`Bạn có chắc muốn xoá video "${vid.title}" không?`)) {
            try {
              await fetch(`/api/videos/${vid.slug}`, { method: "DELETE" });
              showToast("Đã xoá video thành công");
              fetchVideoList();
            } catch (err) {
              showToast("Không thể xoá video");
            }
          }
        });
      }

      videoGrid.appendChild(card);
    });
  }

  btnRefreshVideos.addEventListener("click", () => {
    fetchVideoList();
    showToast("Đã cập nhật danh sách video");
  });

  // ── Video Player Modal ───────────────────────────────────────────────────
  function openPlayerModal(vid) {
    activePlayerSlug = vid.slug;
    playerModalTitle.textContent = vid.title || "Xem Video";
    playerVideoTitle.textContent = vid.title || "Video thành phẩm";
    playerVideoMeta.textContent = `${vid.videoSizeMb ? `${vid.videoSizeMb} MB · ` : ""}Độ phân giải dọc 1080x1920 (9:16)`;

    const mp4Url = vid.videoUrl || `/api/videos/${vid.slug}/file/video.mp4`;
    const downloadUrl = `/api/videos/${vid.slug}/download`;
    const mp3Url = vid.audioUrl || `/api/videos/${vid.slug}/file/voice.mp3`;

    activeVideoPlayer.poster = vid.thumbnailUrl || `/api/videos/${encodeURIComponent(vid.slug)}/thumbnail`;
    activeVideoPlayer.src = mp4Url;
    activeVideoPlayer.play().catch(() => {});

    btnDownloadMp4.href = downloadUrl;
    btnDownloadMp4.setAttribute("download", `${vid.slug}.mp4`);

    btnDownloadMp3.href = mp3Url;
    btnDownloadMp3.setAttribute("download", `${vid.slug}-voice.mp3`);
    if(btnDownloadCover){
      btnDownloadCover.href=`/api/videos/${encodeURIComponent(vid.slug)}/thumbnail?download=1`;
      btnDownloadCover.download=`${vid.slug}-cover.png`;
      btnDownloadCover.style.display='inline-flex';
    }

    playerCaptionBox.textContent = vid.caption || `${vid.title}\n\n#Ai #Github #xuhuong #DevPeek36`;

    btnCopyCaption.onclick = () => {
      navigator.clipboard.writeText(playerCaptionBox.textContent).then(() => {
        showToast("Đã sao chép caption TikTok vào clipboard!");
      });
    };

    if (btnOpenInStudio) {
      btnOpenInStudio.onclick = () => {
        window.open("http://localhost:3002", "_blank");
      };
    }

    playerModal.style.display = "flex";
  }

  function closePlayerModal() {
    activePlayerSlug = null;
    activeVideoPlayer.pause();
    activeVideoPlayer.src = "";
    playerModal.style.display = "none";
  }

  btnClosePlayerModal.addEventListener("click", closePlayerModal);
  playerModal.addEventListener("click", (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  if (btnOpenStudioPreview) {
    btnOpenStudioPreview.addEventListener("click", () => {
      window.open("http://localhost:3002", "_blank");
    });
  }

  // ── Milestone M6: Timeline Editor Client Logic ───────────────────────────
  const btnModeStudio = document.getElementById("btnModeStudio");
  const btnModeFeeds = document.getElementById("btnModeFeeds");
  const btnModeTimeline = document.getElementById("btnModeTimeline");
  const btnModeLexicon = document.getElementById("btnModeLexicon");
  const btnModeLibrary = document.getElementById("btnModeLibrary");

  const heroSection = document.querySelector(".hero-section");
  const studioLayout = document.querySelector(".studio-layout");
  const feedsSection = document.getElementById("feedsSection");
  const timelineEditorSection = document.getElementById("timelineEditorSection");
  const lexiconSection = document.getElementById("lexiconSection");
  const librarySection = document.getElementById("librarySection");

  const btnToggleTheme = document.getElementById("btnToggleTheme");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");
  const btnToggleSafeZone = document.getElementById("btnToggleSafeZone");

  // Feeds elements
  const feedsTableBody = document.getElementById("feedsTableBody");
  const feedsCountBadge = document.getElementById("feedsCountBadge");
  const btnRefreshFeeds = document.getElementById("btnRefreshFeeds");
  const btnRunBatchQueue = document.getElementById("btnRunBatchQueue");
  let cachedFeedItems = [];

  // Lexicon elements
  const lexiconTableBody = document.getElementById("lexiconTableBody");
  const lexiconCountBadge = document.getElementById("lexiconCountBadge");
  const inputLexiconTerm = document.getElementById("inputLexiconTerm");
  const inputLexiconPhonetic = document.getElementById("inputLexiconPhonetic");
  const btnAddLexiconWord = document.getElementById("btnAddLexiconWord");
  const btnSaveLexicon = document.getElementById("btnSaveLexicon");
  let currentLexiconData = {};

  // Timeline & Inspector elements
  const selectTimelineProject = document.getElementById("selectTimelineProject");
  const btnReloadTimelineProject = document.getElementById("btnReloadTimelineProject");
  const btnTimelineUndo = document.getElementById("btnTimelineUndo");
  const btnTimelineRedo = document.getElementById("btnTimelineRedo");
  const btnTimelineSplit = document.getElementById("btnTimelineSplit");
  const btnTimelineRippleDelete = document.getElementById("btnTimelineRippleDelete");
  const checkTimelineSnap = document.getElementById("checkTimelineSnap");
  const btnSaveProjectScript = document.getElementById("btnSaveProjectScript");
  const btnRenderFromTimeline = document.getElementById("btnRenderFromTimeline");
  const btnCancelRenderJob = document.getElementById("btnCancelRenderJob");
  const btnImportSrtModal = document.getElementById("btnImportSrtModal");
  const btnFullscreenPreview = document.getElementById("btnFullscreenPreview");
  const btnDownloadTimelineMp4 = document.getElementById("btnDownloadTimelineMp4");

  const iframePreview = document.getElementById("iframePreview");
  const videoPreviewFallback = document.getElementById("videoPreviewFallback");
  const previewPlayOverlay = document.getElementById("previewPlayOverlay");
  const previewSceneBadge = document.getElementById("previewSceneBadge");
  const previewPlaceholder = document.getElementById("previewPlaceholder");
  const previewScreen = document.getElementById("previewScreen");
  const btnPlayPause = document.getElementById("btnPlayPause");
  const timeDisplay = document.getElementById("timeDisplay");
  const transportScrubber = document.getElementById("transportScrubber");
  const timelinePlayheadLine = document.getElementById("timelinePlayheadLine");

  const inspectorSceneTitle = document.getElementById("inspectorSceneTitle");
  const inspectorSceneType = document.getElementById("inspectorSceneType");
  const inspectorVoiceText = document.getElementById("inspectorVoiceText");
  const inspectorTemplate = document.getElementById("inspectorTemplate");
  const inspectorDuration = document.getElementById("inspectorDuration");
  const inspectorTransition = document.getElementById("inspectorTransition");
  const inspectorKenBurns = document.getElementById("inspectorKenBurns");
  const inspectorMediaSrc = document.getElementById("inspectorMediaSrc");
  const inspectorMediaFit = document.getElementById("inspectorMediaFit");
  const btnReTtsCurrentScene = document.getElementById("btnReTtsCurrentScene");
  const metaSceneId = document.getElementById("metaSceneId");
  const metaSceneStart = document.getElementById("metaSceneStart");

  // Import SRT Modal
  const importSrtModal = document.getElementById("importSrtModal");
  const inputSrtContent = document.getElementById("inputSrtContent");
  const btnCloseImportSrtModal = document.getElementById("btnCloseImportSrtModal");
  const btnCancelImportSrt = document.getElementById("btnCancelImportSrt");
  const btnConfirmImportSrt = document.getElementById("btnConfirmImportSrt");

  // Publish Modal
  const publishModal = document.getElementById("publishModal");
  const publishMarkdownContent = document.getElementById("publishMarkdownContent");
  const btnClosePublishModal = document.getElementById("btnClosePublishModal");
  const btnDismissPublishModal = document.getElementById("btnDismissPublishModal");
  const btnCopyPublishChecklist = document.getElementById("btnCopyPublishChecklist");
  const btnViewPublishChecklist = document.getElementById("btnViewPublishChecklist");
  const btnDownloadCover = document.getElementById("btnDownloadCover");

  const trackRulerArea = document.getElementById("trackRulerArea");
  const trackScenesContent = document.getElementById("trackScenesContent");
  const trackVoiceContent = document.getElementById("trackVoiceContent");
  const trackCaptionsContent = document.getElementById("trackCaptionsContent");
  const trackBgmContent = document.getElementById("trackBgmContent");

  const PX_PER_SEC = 40; // Scale: 40px = 1 second
  let currentProject = null;
  let selectedClipId = null;
  let isPlaying = false;
  let playheadTime = 0;
  let playAnimFrame = null;
  let lastFrameTimestamp = null;
  let undoStack = [];
  let redoStack = [];
  let isSafeZoneActive = false;

  // ── Switch between 5 Modes (Studio, Feeds, Timeline, Lexicon, Library) ───
  function switchMode(mode) {
    const allModeBtns = [btnModeStudio, btnModeFeeds, btnModeTimeline, btnModeLexicon, btnModeLibrary];
    allModeBtns.forEach((b) => b?.classList.remove("active"));

    heroSection.style.display = mode === "studio" ? "block" : "none";
    studioLayout.style.display = mode === "studio" ? "grid" : "none";
    if (feedsSection) feedsSection.style.display = mode === "feeds" ? "flex" : "none";
    if (timelineEditorSection) timelineEditorSection.style.display = mode === "timeline" ? "flex" : "none";
    if (lexiconSection) lexiconSection.style.display = mode === "lexicon" ? "flex" : "none";
    if (librarySection) librarySection.style.display = mode === "library" ? "block" : "none";

    window.dispatchEvent(new CustomEvent("app:mode",{detail:mode}));
    if (mode === "studio") {
      btnModeStudio?.classList.add("active");
    } else if (mode === "feeds") {
      btnModeFeeds?.classList.add("active");
    } else if (mode === "timeline") {
      btnModeTimeline?.classList.add("active");
      loadProjectsList();
    } else if (mode === "lexicon") {
      btnModeLexicon?.classList.add("active");
      loadLexiconData();
    } else if (mode === "library") {
      btnModeLibrary?.classList.add("active");
      fetchVideoList();
    }

    if (mode !== "timeline") {
      stopPlayback();
    }
  }

  btnModeStudio?.addEventListener("click", () => switchMode("studio"));
  btnModeFeeds?.addEventListener("click", () => switchMode("feeds"));
  btnModeTimeline?.addEventListener("click", () => switchMode("timeline"));
  btnModeLexicon?.addEventListener("click", () => switchMode("lexicon"));
  btnModeLibrary?.addEventListener("click", () => switchMode("library"));

  // ── Theme Switcher (M3 Dual Theme) ───────────────────────────────────────
  btnToggleTheme?.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("theme-light-pro");
    if (isLight) {
      themeIcon.textContent = "☀️";
      themeLabel.textContent = "Light Pro";
      showToast("Đã chuyển sang Theme Light Pro");
    } else {
      themeIcon.textContent = "🌙";
      themeLabel.textContent = "Dark Neon";
      showToast("Đã chuyển sang Theme Dark Neon");
    }
  });

  // ── TikTok Safe Zone Toggle (M5) ─────────────────────────────────────────
  btnToggleSafeZone?.addEventListener("click", () => {
    isSafeZoneActive = !isSafeZoneActive;
    let guide = previewScreen?.querySelector(".safe-zone-guide");
    if (isSafeZoneActive) {
      if (!guide && previewScreen) {
        guide = document.createElement("div");
        guide.className = "safe-zone-guide";
        previewScreen.appendChild(guide);
      }
      btnToggleSafeZone.classList.add("active");
      showToast("Đã bật lưới Safe Zone TikTok (380px đáy, 120px phải)");
    } else {
      if (guide) guide.remove();
      btnToggleSafeZone.classList.remove("active");
      showToast("Đã tắt lưới Safe Zone");
    }
  });

  // Fetch projects list for timeline selector
  async function loadProjectsList(preferredSlug) {
    try {
      const res = await fetch("/api/projects");
      const list = await res.json();
      selectTimelineProject.innerHTML = "";

      if (list.length === 0) {
        selectTimelineProject.innerHTML = `<option value="">-- Chưa có dự án nào --</option>`;
        return;
      }

      list.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.slug;
        opt.textContent = `${p.title} (${p.sceneCount} cảnh · v${p.schemaVersion})`;
        selectTimelineProject.appendChild(opt);
      });

      const chosenSlug = preferredSlug || (currentProject ? currentProject.slug : list[0].slug);
      selectTimelineProject.value = chosenSlug;
      loadProjectDetail(chosenSlug);
    } catch (err) {
      console.error(err);
      showToast("Không thể tải danh sách dự án");
    }
  }

  selectTimelineProject.addEventListener("change", (e) => {
    if (e.target.value) {
      loadProjectDetail(e.target.value);
    }
  });

  btnReloadTimelineProject.addEventListener("click", () => {
    if (selectTimelineProject.value) {
      loadProjectDetail(selectTimelineProject.value);
      showToast("Đã nạp lại dữ liệu dự án");
    }
  });

  // Load project details & build timeline UI
  async function loadProjectDetail(slug) {
    try {
      stopPlayback();
      const res = await fetch(`/api/projects/${slug}`);
      if (!res.ok) throw new Error("Lỗi nạp dự án");
      currentProject = await res.json();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();

      renderProjectTimeline(currentProject.timelineState);
      setupPreviewPlayer();

      if (currentProject.timelineState.tracks[0]?.clips[0]) {
        selectClip(currentProject.timelineState.tracks[0].clips[0].id);
      }
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    }
  }

  function setupPreviewPlayer() {
    if (!currentProject) {
      if (previewScreen) previewScreen.classList.remove("has-project");
      iframePreview.style.display = "none";
      videoPreviewFallback.style.display = "none";
      if (previewPlayOverlay) previewPlayOverlay.style.display = "none";
      if (previewSceneBadge) previewSceneBadge.style.display = "none";
      if (btnDownloadTimelineMp4) btnDownloadTimelineMp4.style.display = "none";
      previewPlaceholder.style.display = "flex";
      previewPlaceholder.innerHTML = `<span>📱 Chưa chọn dự án để xem trước</span>`;
      return;
    }

    if (currentProject.videoUrl) {
      if (previewScreen) previewScreen.classList.add("has-project");
      previewPlaceholder.style.display = "none";

      iframePreview.style.display = "none";
      videoPreviewFallback.style.display = "block";

      if (btnDownloadTimelineMp4) {
        btnDownloadTimelineMp4.style.display = "inline-flex";
        btnDownloadTimelineMp4.href = `/api/videos/${currentProject.slug}/download`;
        btnDownloadTimelineMp4.setAttribute("download", `${currentProject.slug}.mp4`);
      }

      const currentLoadedSrc = videoPreviewFallback.getAttribute("data-loaded-src");
      const targetSrc = currentProject.videoUrl;
      if (currentLoadedSrc !== targetSrc) {
        videoPreviewFallback.setAttribute("data-loaded-src", targetSrc);
        videoPreviewFallback.src = targetSrc;
        videoPreviewFallback.load();
      }

      const targetTime = playheadTime || 0;
      if (videoPreviewFallback.readyState >= 1) {
        try {
          const safeDur = videoPreviewFallback.duration;
          videoPreviewFallback.currentTime = safeDur && !isNaN(safeDur) ? Math.min(targetTime, safeDur) : targetTime;
        } catch {}
      } else {
        videoPreviewFallback.onloadedmetadata = () => {
          try {
            const safeDur = videoPreviewFallback.duration;
            videoPreviewFallback.currentTime = safeDur && !isNaN(safeDur) ? Math.min(targetTime, safeDur) : targetTime;
          } catch {}
        };
      }

      if (previewPlayOverlay) {
        previewPlayOverlay.style.display = "flex";
        previewPlayOverlay.classList.remove("hidden");
      }
      if (previewSceneBadge) previewSceneBadge.style.display = "block";
    } else if (currentProject.previewUrl) {
      if (previewScreen) previewScreen.classList.add("has-project");
      previewPlaceholder.style.display = "none";
      if (btnDownloadTimelineMp4) btnDownloadTimelineMp4.style.display = "none";

      iframePreview.style.display = "block";
      videoPreviewFallback.style.display = "none";
      iframePreview.src = currentProject.previewUrl;
      if (previewPlayOverlay) previewPlayOverlay.style.display = "none";
      if (previewSceneBadge) previewSceneBadge.style.display = "none";
    } else {
      if (previewScreen) previewScreen.classList.remove("has-project");
      if (btnDownloadTimelineMp4) btnDownloadTimelineMp4.style.display = "none";
      iframePreview.style.display = "none";
      videoPreviewFallback.style.display = "none";
      if (previewPlayOverlay) previewPlayOverlay.style.display = "none";
      if (previewSceneBadge) previewSceneBadge.style.display = "none";
      previewPlaceholder.style.display = "flex";
      previewPlaceholder.innerHTML = `<span>⏳ Dự án chưa render.<br>Sử dụng Timeline Editor và bấm <b>Render Video</b>!</span>`;
    }
  }

  // Format seconds to MM:SS.S
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
  }

  // Render Visual Timeline Tracks
  function renderProjectTimeline(state) {
    const totalDuration = state.totalDuration || 30;
    const totalWidthPx = Math.max(1200, Math.ceil(totalDuration * PX_PER_SEC) + 100);

    // 1. Ruler
    trackRulerArea.innerHTML = "";
    trackRulerArea.style.width = `${totalWidthPx}px`;
    for (let t = 0; t <= totalDuration + 2; t += 1) {
      const left = t * PX_PER_SEC;
      const isMajor = t % 5 === 0;
      const tick = document.createElement("div");
      tick.className = "ruler-tick";
      tick.style.left = `${left}px`;
      if (isMajor) {
        tick.textContent = `${t}s`;
        tick.style.borderLeftColor = "rgba(255, 255, 255, 0.4)";
      }
      trackRulerArea.appendChild(tick);
    }

    // Update scrubber bounds
    transportScrubber.max = totalDuration;
    transportScrubber.value = playheadTime;
    timeDisplay.textContent = `${formatTime(playheadTime)} / ${formatTime(totalDuration)}`;

    // Helper render track clips
    function renderClips(trackType, container) {
      container.innerHTML = "";
      container.style.width = `${totalWidthPx}px`;
      const track = state.tracks.find((t) => t.type === trackType);
      if (!track) return;

      track.clips.forEach((clip) => {
        const el = document.createElement("div");
        el.className = `timeline-clip clip-${clip.meta?.template || trackType}`;
        if (clip.id === selectedClipId) el.classList.add("selected");

        const leftPx = clip.start * PX_PER_SEC;
        const widthPx = Math.max(16, clip.duration * PX_PER_SEC);

        el.style.left = `${leftPx}px`;
        el.style.width = `${widthPx}px`;
        el.dataset.clipId = clip.id;
        el.textContent = clip.name;
        el.title = `${clip.name} [${clip.start.toFixed(1)}s - ${(clip.start + clip.duration).toFixed(1)}s]`;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectClip(clip.id);
          // Jump playhead and preview to this scene
          playheadTime = clip.start;
          updatePlayheadPosition();
          seekPreview(playheadTime);
        });

        container.appendChild(el);
      });
    }

    renderClips("scene", trackScenesContent);
    renderClips("voice", trackVoiceContent);
    renderClips("caption", trackCaptionsContent);
    renderClips("bgm", trackBgmContent);

    updatePlayheadPosition();
  }

  function selectClip(clipId) {
    selectedClipId = clipId;
    document.querySelectorAll(".timeline-clip").forEach((el) => {
      el.classList.toggle("selected", el.dataset.clipId === clipId);
    });

    if (!currentProject?.timelineState) return;

    // Find clip in all tracks
    let foundClip = null;
    for (const track of currentProject.timelineState.tracks) {
      const match = track.clips.find((c) => c.id === clipId);
      if (match) {
        foundClip = match;
        break;
      }
    }

    if (foundClip && foundClip.sceneId) {
      const scene = currentProject.script.scenes.find((s) => s.id === foundClip.sceneId);
      if (scene) {
        inspectorSceneTitle.textContent = `Chi Tiết Cảnh: ${scene.id}`;
        inspectorSceneType.textContent = scene.type;
        inspectorVoiceText.value = scene.voiceText;
        const timingHost=document.getElementById('inspectorBlockTiming');
        if(timingHost){const panel=document.createElement('div');timingHost.replaceChildren(panel);window.Studio?.blockTimingEditor(panel,Object.assign(scene,{githubStarLeadIn:scene.type==='hook'&&Boolean(currentProject.script.metadata.githubStars)})).catch(err=>{panel.textContent=err.message;});}
        inspectorTemplate.value = scene.templateData.template;
        inspectorDuration.value = foundClip.duration.toFixed(1);
        metaSceneId.textContent = scene.id;
        metaSceneStart.textContent = `${foundClip.start.toFixed(1)}s`;

        if (inspectorTransition) inspectorTransition.value = scene.transition?.type || "cut";
        if (inspectorKenBurns) inspectorKenBurns.value = scene.media?.fx || (scene.templateData?.kenBurns || "zoom-in");
        if (inspectorMediaSrc) inspectorMediaSrc.value = scene.media?.src || "";
        if (inspectorMediaFit) inspectorMediaFit.value = scene.media?.fit || "cover";
      }
    }
  }

  // Update playhead UI
  function updatePlayheadPosition() {
    const leftPx = 140 + playheadTime * PX_PER_SEC;
    timelinePlayheadLine.style.left = `${leftPx}px`;
    transportScrubber.value = playheadTime;
    const total = currentProject?.timelineState?.totalDuration || 30;
    timeDisplay.textContent = `${formatTime(playheadTime)} / ${formatTime(total)}`;

    // Update active scene badge on phone mockup
    if (previewSceneBadge && currentProject?.timelineState) {
      const sceneTrack = currentProject.timelineState.tracks.find((t) => t.type === "scene");
      if (sceneTrack) {
        const activeClip = sceneTrack.clips.find(
          (c) => playheadTime >= c.start && playheadTime < c.start + c.duration
        );
        if (activeClip) {
          previewSceneBadge.style.display = "block";
          previewSceneBadge.textContent = `${activeClip.name} (${formatTime(playheadTime)})`;
        }
      }
    }
  }

  // Playhead Scrubber Input
  transportScrubber.addEventListener("input", (e) => {
    playheadTime = parseFloat(e.target.value);
    updatePlayheadPosition();
    seekPreview(playheadTime);
  });

  // Transport Play/Pause
  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    isPlaying = true;
    btnPlayPause.textContent = "⏸";
    if (previewPlayOverlay) previewPlayOverlay.classList.add("hidden");
    lastFrameTimestamp = performance.now();

    if (videoPreviewFallback.src && videoPreviewFallback.style.display !== "none") {
      videoPreviewFallback.currentTime = playheadTime;
      videoPreviewFallback.play().catch(() => {});
    }

    function step(timestamp) {
      if (!isPlaying) return;
      const deltaSec = (timestamp - lastFrameTimestamp) / 1000;
      lastFrameTimestamp = timestamp;

      // When video is active and playing natively, timeupdate handles playheadTime
      if (videoPreviewFallback.style.display === "none" || videoPreviewFallback.paused) {
        playheadTime += deltaSec;
        const total = currentProject?.timelineState?.totalDuration || 30;

        if (playheadTime >= total) {
          playheadTime = 0;
          stopPlayback();
          return;
        }

        updatePlayheadPosition();
        seekPreview(playheadTime);
      }

      playAnimFrame = requestAnimationFrame(step);
    }

    playAnimFrame = requestAnimationFrame(step);
  }

  function stopPlayback() {
    isPlaying = false;
    btnPlayPause.textContent = "▶";
    if (previewPlayOverlay) previewPlayOverlay.classList.remove("hidden");
    if (playAnimFrame) cancelAnimationFrame(playAnimFrame);
    if (videoPreviewFallback.src) videoPreviewFallback.pause();
  }

  btnPlayPause.addEventListener("click", togglePlayback);
  previewPlayOverlay?.addEventListener("click", togglePlayback);
  videoPreviewFallback?.addEventListener("click", togglePlayback);

  // Fullscreen / Modal Preview Button
  btnFullscreenPreview?.addEventListener("click", () => {
    if (!currentProject) {
      showToast("Chưa chọn dự án nào!");
      return;
    }
    stopPlayback();
    openPlayerModal({
      slug: currentProject.slug,
      title: currentProject.script?.metadata?.title || currentProject.slug,
      videoUrl: currentProject.videoUrl,
      audioUrl: currentProject.audioUrl,
      caption: currentProject.script?.metadata?.title || "",
      videoSizeMb: "90.9",
    });
  });

  // Sync video preview events
  videoPreviewFallback.addEventListener("timeupdate", () => {
    if (isPlaying && videoPreviewFallback.style.display !== "none") {
      playheadTime = videoPreviewFallback.currentTime;
      updatePlayheadPosition();
    }
  });

  videoPreviewFallback.addEventListener("ended", () => {
    stopPlayback();
    playheadTime = 0;
    updatePlayheadPosition();
  });

  function seekPreview(time) {
    if (videoPreviewFallback.style.display !== "none" && videoPreviewFallback.src) {
      try {
        const safeDur = videoPreviewFallback.duration;
        const target = safeDur && !isNaN(safeDur) ? Math.min(Math.max(0, time), safeDur) : Math.max(0, time);
        videoPreviewFallback.currentTime = target;
      } catch {}
    } else if (iframePreview.style.display !== "none" && iframePreview.contentWindow) {
      try {
        const win = iframePreview.contentWindow;
        if (win.__timelines && win.__timelines["news-video"]) {
          win.__timelines["news-video"].seek(time);
        }
      } catch {}
    }
  }

  document.getElementById('btnReferenceDesign')?.addEventListener('click',()=>{
    if(!currentProject)return;
    currentProject.script.templatePack='reference';currentProject.script.visualStyle='tech-editorial';currentProject.script.motionPreset='calm';
    currentProject.script.creative={presetId:'reference',hookType:'problem-solution',structureId:'explainer'};
    currentProject.script.captions={enabled:true,style:'minimal',highlightMode:'estimated'};
    currentProject.timelineState.script=currentProject.script;
    showToast('Đã áp dụng thiết kế video mẫu cho mọi cảnh. Lưu kịch bản rồi Render để tạo bản mới.');
  });

  // Inspector Field Changes
  inspectorVoiceText.addEventListener("input", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      scene.voiceText = inspectorVoiceText.value;
    }
  });

  inspectorVoiceText.addEventListener("change", () => {
    showToast("Đã cập nhật lời thoại. Hãy bấm Lưu kịch bản hoặc Re-TTS.");
  });

  inspectorTemplate.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      pushCommandState();
      scene.templateData.template = inspectorTemplate.value;
      if (clip.meta) clip.meta.template = inspectorTemplate.value;
      renderProjectTimeline(currentProject.timelineState);
      showToast(`Đã đổi template thành '${inspectorTemplate.value}'.`);
    }
  });

  // Re-TTS Current Scene
  btnReTtsCurrentScene.addEventListener("click", async () => {
    if (!currentProject || !selectedClipId) {
      showToast("Vui lòng chọn một cảnh visual trên timeline!");
      return;
    }

    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) {
      showToast("Không tìm thấy thông tin cảnh để Re-TTS!");
      return;
    }

    const sceneId = clip.sceneId;
    btnReTtsCurrentScene.disabled = true;
    btnReTtsCurrentScene.innerHTML = `<span class="modal-spinner" style="width: 14px; height: 14px; display: inline-block;"></span> Đang tạo lại giọng đọc...`;

    try {
      const res = await fetch(`/api/projects/${currentProject.slug}/re-tts/${sceneId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-TTS thất bại");

      showToast(`Re-TTS thành công! Thời lượng mới: ${data.newDuration}s`);
      await loadProjectDetail(currentProject.slug);
    } catch (err) {
      console.error(err);
      showToast(`Lỗi Re-TTS: ${err.message}`);
    } finally {
      btnReTtsCurrentScene.disabled = false;
      btnReTtsCurrentScene.innerHTML = `<span class="icon">🎙️</span><span>Tạo Lại Giọng Đọc (Re-TTS) Riêng Cảnh Này</span>`;
    }
  });

  // Command Pattern Buttons: Undo / Redo / Ripple Delete / Split
  function updateUndoRedoButtons() {
    btnTimelineUndo.disabled = undoStack.length === 0;
    btnTimelineRedo.disabled = redoStack.length === 0;
  }

  function pushCommandState() {
    undoStack.push(JSON.parse(JSON.stringify(currentProject)));
    redoStack = [];
    updateUndoRedoButtons();
  }

  btnTimelineUndo.addEventListener("click", () => {
    if (undoStack.length === 0) return;
    const prev = undoStack.pop();
    redoStack.push(JSON.parse(JSON.stringify(currentProject)));
    currentProject = prev;
    renderProjectTimeline(currentProject.timelineState);
    updateUndoRedoButtons();
    showToast("Đã Hoàn tác (Undo)");
  });

  btnTimelineRedo.addEventListener("click", () => {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(JSON.parse(JSON.stringify(currentProject)));
    currentProject = next;
    renderProjectTimeline(currentProject.timelineState);
    updateUndoRedoButtons();
    showToast("Đã Làm lại (Redo)");
  });

  // Ripple Delete Scene
  btnTimelineRippleDelete.addEventListener("click", () => {
    if (!currentProject || !selectedClipId) {
      showToast("Vui lòng chọn cảnh cần xóa!");
      return;
    }
    const sceneTrack = currentProject.timelineState.tracks.find((t) => t.type === "scene");
    const clipIndex = sceneTrack?.clips.findIndex((c) => c.id === selectedClipId);
    if (!sceneTrack || clipIndex === -1 || clipIndex === undefined) return;

    if (sceneTrack.clips.length <= 5) {
      showToast("Video cần tối thiểu 5 cảnh để đảm bảo cấu trúc TikTok.");
      return;
    }

    pushCommandState();
    const [deleted] = sceneTrack.clips.splice(clipIndex, 1);
    const shift = deleted.duration;

    for (const clip of sceneTrack.clips) {
      if (clip.start >= deleted.start) {
        clip.start = Math.max(0, clip.start - shift);
      }
    }

    if (deleted.sceneId) {
      currentProject.script.scenes = currentProject.script.scenes.filter((s) => s.id !== deleted.sceneId);
    }

    let maxEnd = 0;
    sceneTrack.clips.forEach((c) => {
      if (c.start + c.duration > maxEnd) maxEnd = c.start + c.duration;
    });
    currentProject.timelineState.totalDuration = Math.round(maxEnd * 100) / 100;

    renderProjectTimeline(currentProject.timelineState);
    showToast(`Đã xóa cảnh '${deleted.name}' và dồn track (Ripple Delete).`);
  });

  // Split Scene at Playhead (Tách Cảnh)
  btnTimelineSplit?.addEventListener("click", () => {
    if (!currentProject) {
      showToast("Chưa chọn dự án nào!");
      return;
    }
    const sceneTrack = currentProject.timelineState.tracks.find((t) => t.type === "scene");
    if (!sceneTrack) return;

    // Find clip containing current playheadTime
    const clipIndex = sceneTrack.clips.findIndex(
      (c) => playheadTime > c.start + 0.3 && playheadTime < c.start + c.duration - 0.3,
    );

    if (clipIndex === -1) {
      showToast("Kéo con trỏ Playhead vào giữa một cảnh (cách 2 đầu ít nhất 0.3s) để tách!");
      return;
    }

    pushCommandState();
    const clip = sceneTrack.clips[clipIndex];
    const origDuration = clip.duration;
    const splitPoint = Math.round((playheadTime - clip.start) * 10) / 10;
    clip.duration = splitPoint;

    const newClipId = `clip-split-${Date.now()}`;
    const newSceneId = `scene-split-${Date.now().toString().slice(-4)}`;
    const remainingDur = Math.round((origDuration - splitPoint) * 10) / 10;

    const newClip = {
      id: newClipId,
      sceneId: newSceneId,
      trackId: clip.trackId,
      name: `${clip.name} (phần 2)`,
      start: Math.round(playheadTime * 10) / 10,
      duration: remainingDur,
      meta: { ...clip.meta },
    };

    sceneTrack.clips.splice(clipIndex + 1, 0, newClip);

    // Duplicate corresponding scene in script.json
    const origSceneIdx = currentProject.script.scenes.findIndex((s) => s.id === clip.sceneId);
    if (origSceneIdx !== -1) {
      const origScene = currentProject.script.scenes[origSceneIdx];
      const clonedScene = JSON.parse(JSON.stringify(origScene));
      clonedScene.id = newSceneId;
      clonedScene.voiceText = `Tiếp tục: ${origScene.voiceText.slice(0, 35)}...`;
      currentProject.script.scenes.splice(origSceneIdx + 1, 0, clonedScene);
    }

    renderProjectTimeline(currentProject.timelineState);
    selectClip(newClipId);
    showToast(`Đã tách cảnh tại ${playheadTime.toFixed(1)}s!`);
  });

  // Adjust Scene Duration
  inspectorDuration?.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const newDur = Math.max(0.5, Math.min(60, parseFloat(inspectorDuration.value) || 3.0));
    inspectorDuration.value = newDur.toFixed(1);

    const sceneTrack = currentProject.timelineState.tracks.find((t) => t.type === "scene");
    const clipIndex = sceneTrack?.clips.findIndex((c) => c.id === selectedClipId);
    if (!sceneTrack || clipIndex === -1 || clipIndex === undefined) return;

    pushCommandState();
    const clip = sceneTrack.clips[clipIndex];
    const oldDur = clip.duration;
    const diff = newDur - oldDur;
    clip.duration = newDur;

    // Ripple shift subsequent clips if snap/shift enabled
    for (let i = clipIndex + 1; i < sceneTrack.clips.length; i++) {
      sceneTrack.clips[i].start = Math.max(0, sceneTrack.clips[i].start + diff);
    }

    let maxEnd = 0;
    sceneTrack.clips.forEach((c) => {
      if (c.start + c.duration > maxEnd) maxEnd = c.start + c.duration;
    });
    currentProject.timelineState.totalDuration = Math.round(maxEnd * 100) / 100;

    renderProjectTimeline(currentProject.timelineState);
    showToast(`Đã đổi thời lượng cảnh thành ${newDur.toFixed(1)}s (Đã dồn track).`);
  });

  // Save Project Script
  btnSaveProjectScript.addEventListener("click", async () => {
    if (!currentProject) return;
    try {
      btnSaveProjectScript.disabled = true;
      btnSaveProjectScript.textContent = "Đang lưu...";

      const res = await fetch(`/api/projects/${currentProject.slug}/script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: currentProject.script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu script");

      showToast("Đã lưu kịch bản script.json thành công!");
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSaveProjectScript.disabled = false;
      btnSaveProjectScript.innerHTML = `<span>💾</span> Lưu Kịch Bản`;
    }
  });

  // Inspector Media & Transition Changes (M2, M5)
  inspectorTransition?.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      if (!scene.transition) scene.transition = { type: "cut", duration: 0.3 };
      scene.transition.type = inspectorTransition.value;
      showToast(`Đã đổi chuyển cảnh thành: ${inspectorTransition.value}`);
    }
  });

  inspectorKenBurns?.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      if (!scene.media) scene.media = { type: "image", src: "", fit: "cover", fx: "zoom-in" };
      scene.media.fx = inspectorKenBurns.value;
      showToast(`Hiệu ứng Ken Burns: ${inspectorKenBurns.value}`);
    }
  });

  inspectorMediaSrc?.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      const srcVal = inspectorMediaSrc.value.trim();
      if (!scene.media) scene.media = { type: "image", src: srcVal, fit: "cover", fx: "zoom-in" };
      else scene.media.src = srcVal;
      showToast(`Đã gắn nguồn media: ${srcVal}`);
    }
  });

  inspectorMediaFit?.addEventListener("change", () => {
    if (!currentProject || !selectedClipId) return;
    const clip = currentProject.timelineState.tracks[0]?.clips.find((c) => c.id === selectedClipId);
    if (!clip?.sceneId) return;
    const scene = currentProject.script.scenes.find((s) => s.id === clip.sceneId);
    if (scene) {
      if (!scene.media) scene.media = { type: "image", src: "", fit: "cover", fx: "zoom-in" };
      scene.media.fit = inspectorMediaFit.value;
    }
  });

  // ── Import SRT Modal (M1) ────────────────────────────────────────────────
  btnImportSrtModal?.addEventListener("click", () => {
    if (!currentProject) {
      showToast("Vui lòng chọn hoặc mở một dự án trước!");
      return;
    }
    inputSrtContent.value = "";
    importSrtModal.style.display = "flex";
  });

  btnCloseImportSrtModal?.addEventListener("click", () => {
    importSrtModal.style.display = "none";
  });
  btnCancelImportSrt?.addEventListener("click", () => {
    importSrtModal.style.display = "none";
  });

  btnConfirmImportSrt?.addEventListener("click", async () => {
    const srtContent = inputSrtContent.value.trim();
    if (!srtContent) {
      showToast("Vui lòng dán nội dung file SRT!");
      return;
    }

    try {
      btnConfirmImportSrt.disabled = true;
      btnConfirmImportSrt.textContent = "Đang lưu...";

      const res = await fetch(`/api/projects/${currentProject.slug}/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srtContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi import SRT");

      showToast(`Đã nhập thành công ${data.count} cues phụ đề!`);
      importSrtModal.style.display = "none";
      await loadProjectDetail(currentProject.slug);
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnConfirmImportSrt.disabled = false;
      btnConfirmImportSrt.textContent = "Lưu Phụ Đề Này";
    }
  });

  // ── Publish Kit Modal (M7) ───────────────────────────────────────────────
  btnViewPublishChecklist?.addEventListener("click", async () => {
    if (!activeVideoPlayer.src) return;
    // Lấy slug từ player title hoặc active project
    const currentSlug = activePlayerSlug;
    if (!currentSlug) return;

    try {
      const res = await fetch(`/api/projects/${currentSlug}/publish`);
      const data = await res.json();
      publishMarkdownContent.textContent = data.publishContent || "Chưa có checklist đăng bài.";

      publishModal.style.display = "flex";
    } catch (err) {
      console.error(err);
      showToast("Không thể tải thông tin publish");
    }
  });

  btnClosePublishModal?.addEventListener("click", () => {
    publishModal.style.display = "none";
  });
  btnDismissPublishModal?.addEventListener("click", () => {
    publishModal.style.display = "none";
  });

  btnCopyPublishChecklist?.addEventListener("click", () => {
    navigator.clipboard.writeText(publishMarkdownContent.textContent).then(() => {
      showToast("Đã sao chép toàn bộ checklist đăng bài vào clipboard!");
    });
  });

  window.addEventListener('radar:import',event=>{
    const link=event.detail?.link;
    if(typeof link!=='string'||!/^https?:\/\//i.test(link))return;
    if(btnSubmitUrl.disabled||btnExtractUrl.disabled){showToast('Studio đang xử lý. Vui lòng chờ xong trước khi nhập bài khác.');return;}
    switchMode('studio');document.getElementById('tabUrl').click();
    inputArticleUrl.value=link;currentExtractedData=null;extractedCard.style.display='none';
    inputArticleUrl.scrollIntoView({behavior:'smooth',block:'center'});inputArticleUrl.focus();btnExtractUrl.click();
  });
  document.getElementById('legacyFeeds')?.addEventListener('toggle',event=>{if(event.target.open&&!cachedFeedItems.length)loadFeedsData();});

  // ── Feeds RSS Logic (Milestone M7) ───────────────────────────────────────
  async function loadFeedsData() {
    feedsTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #94a3b8; padding: 2rem;">
          <span class="modal-spinner" style="width: 18px; height: 18px; display: inline-block;"></span> Đang quét các nguồn RSS...
        </td>
      </tr>
    `;

    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      cachedFeedItems = data.items || [];
      feedsCountBadge.textContent = `${cachedFeedItems.length} Bài Viết`;

      if (cachedFeedItems.length === 0) {
        feedsTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: #94a3b8; padding: 2rem;">
              Không tìm thấy bài viết nào hoặc không thể kết nối mạng ngoài.
            </td>
          </tr>
        `;
        return;
      }

      feedsTableBody.innerHTML = "";
      cachedFeedItems.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight: 700; color: #94a3b8;">#${idx + 1}</td>
          <td><span class="feed-source-pill">${escapeHtml(item.sourceName || "News")}</span></td>
          <td>
            <a href="${escapeHtml(item.link)}" target="_blank" style="color: #fff; text-decoration: none; font-weight: 600;">
              ${escapeHtml(item.title)}
            </a>
          </td>
          <td style="color: #94a3b8; font-size: 0.78rem;">${item.pubDate ? escapeHtml(item.pubDate.slice(0, 22)) : "Mới nhất"}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-primary btn-glow btn-create-feed-video" data-index="${idx}">
              <span>⚡ Tạo Video</span>
            </button>
          </td>
        `;

        const btnCreate = tr.querySelector(".btn-create-feed-video");
        btnCreate?.addEventListener("click", () => {
          launchPipeline({
            title: item.title,
            content: item.description || item.title,
            url: item.link,
            domain: item.domain || "news",
            channel: "DevPeek36",
          });
        });

        feedsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      feedsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #ef4444; padding: 2rem;">
            Lỗi nạp tin tức RSS: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  btnRefreshFeeds?.addEventListener("click", () => {
    loadFeedsData();
    showToast("Đang làm mới danh sách tin RSS...");
  });

  btnRunBatchQueue?.addEventListener("click", async () => {
    if (cachedFeedItems.length === 0) {
      showToast("Chưa có bài viết nào để chạy batch!");
      return;
    }
    const toRun = cachedFeedItems.slice(0, 3);
    if (confirm(`Bạn có chắc muốn tự động tạo video cho ${toRun.length} bài viết liên tiếp trong hàng đợi Batch Queue?`)) {
      try {
        btnRunBatchQueue.disabled = true;
        btnRunBatchQueue.textContent = "Đang kích hoạt hàng đợi...";
        const res = await fetch("/api/feeds/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: toRun, maxJobs: 3 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast("Hàng đợi Batch Queue đã bắt đầu xử lý!");
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
      } finally {
        btnRunBatchQueue.disabled = false;
        btnRunBatchQueue.innerHTML = `<span class="icon">🚀</span><span>Chạy Batch Queue (3 Bài)</span>`;
      }
    }
  });

  // ── Lexicon Pronunciation Dictionary Logic (Milestone M5) ────────────────
  async function loadLexiconData() {
    lexiconTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #94a3b8; padding: 1.5rem;">
          <span class="modal-spinner" style="width: 16px; height: 16px; display: inline-block;"></span> Đang đọc từ điển...
        </td>
      </tr>
    `;

    try {
      const res = await fetch("/api/lexicon");
      currentLexiconData = await res.json();
      renderLexiconTable();
    } catch (err) {
      console.error(err);
      showToast("Không thể tải từ điển phát âm");
    }
  }

  function renderLexiconTable() {
    const entries = Object.entries(currentLexiconData);
    lexiconCountBadge.textContent = `${entries.length} Từ`;

    if (entries.length === 0) {
      lexiconTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #94a3b8; padding: 1.5rem;">
            Chưa có từ vựng nào trong từ điển. Hãy thêm từ đầu tiên của bạn ở trên!
          </td>
        </tr>
      `;
      return;
    }

    lexiconTableBody.innerHTML = "";
    entries.forEach(([term, phonetic], idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 700; color: #94a3b8;">#${idx + 1}</td>
        <td style="font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);">${escapeHtml(term)}</td>
        <td style="color: #f1f5f9;">${escapeHtml(phonetic)}</td>
        <td style="text-align: center;">
          <button class="btn btn-sm btn-outline text-danger btn-delete-lexicon" data-term="${escapeHtml(term)}" title="Xóa từ này">
            ✕
          </button>
        </td>
      `;

      const btnDelete = tr.querySelector(".btn-delete-lexicon");
      btnDelete?.addEventListener("click", () => {
        delete currentLexiconData[term];
        renderLexiconTable();
        showToast(`Đã xóa '${term}'. Hãy bấm Lưu Từ Điển.`);
      });

      lexiconTableBody.appendChild(tr);
    });
  }

  btnAddLexiconWord?.addEventListener("click", () => {
    const term = inputLexiconTerm.value.trim();
    const phonetic = inputLexiconPhonetic.value.trim();

    if (!term || !phonetic) {
      showToast("Vui lòng nhập cả từ gốc và phiên âm đọc!");
      return;
    }

    currentLexiconData[term] = phonetic;
    inputLexiconTerm.value = "";
    inputLexiconPhonetic.value = "";
    renderLexiconTable();
    showToast(`Đã thêm '${term}' ➔ '${phonetic}'. Bấm Lưu Từ Điển để áp dụng.`);
  });

  btnSaveLexicon?.addEventListener("click", async () => {
    try {
      btnSaveLexicon.disabled = true;
      btnSaveLexicon.textContent = "Đang lưu...";

      const res = await fetch("/api/lexicon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lexicon: currentLexiconData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast("Đã lưu từ điển phát âm lexicon.json thành công!");
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSaveLexicon.disabled = false;
      btnSaveLexicon.innerHTML = `<span>💾</span><span>Lưu Từ Điển</span>`;
    }
  });

  // Render Video from Timeline
  btnRenderFromTimeline.addEventListener("click", () => {
    if (!currentProject) return;
    launchPipeline({ script: currentProject.script });
  });

  // Cancel Job Event
  if (btnCancelRenderJob) {
    btnCancelRenderJob.addEventListener("click", async () => {
      if (!currentActiveJob) return;
      try {
        await fetch(`/api/jobs/${currentActiveJob}/cancel`, { method: "POST" });
        showToast("Đã gửi yêu cầu huỷ render!");
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Escape HTML helper
  function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // ── Milestone M4: LLM Configuration & Model Settings ─────────────────────
  const llmStatusBadge = document.getElementById("llmStatusBadge");
  const llmStatusDot = document.getElementById("llmStatusDot");
  const llmStatusText = document.getElementById("llmStatusText");
  const btnOpenLlmModal = document.getElementById("btnOpenLlmModal");
  const llmModal = document.getElementById("llmModal");
  const btnCloseLlmModal = document.getElementById("btnCloseLlmModal");
  const btnCancelLlmModal = document.getElementById("btnCancelLlmModal");
  const btnSaveLlmConfig = document.getElementById("btnSaveLlmConfig");
  const btnTestLlmConnection = document.getElementById("btnTestLlmConnection");

  const inputLlmApiKey = document.getElementById("inputLlmApiKey");
  const btnToggleApiKeyEye = document.getElementById("btnToggleApiKeyEye");
  const llmKeyStatusBadge = document.getElementById("llmKeyStatusBadge");
  const llmGetApiKeyLink = document.getElementById("llmGetApiKeyLink");
  const llmApiKeyNote = document.getElementById("llmApiKeyNote");

  const selectLlmModelPreset = document.getElementById("selectLlmModelPreset");
  const inputLlmModelCustom = document.getElementById("inputLlmModelCustom");
  const groupLlmBaseUrl = document.getElementById("groupLlmBaseUrl");
  const inputLlmBaseUrl = document.getElementById("inputLlmBaseUrl");
  const groupLlmApiKey = document.getElementById("groupLlmApiKey");
  const rowLlmModel = document.getElementById("rowLlmModel");
  const llmTestResultAlert = document.getElementById("llmTestResultAlert");

  const llmBannerModelUrl = document.getElementById("llmBannerModelUrl");
  const llmBannerModelText = document.getElementById("llmBannerModelText");

  let currentLlmConfig = {
    provider: "gemini",
    model: "gemini-2.0-flash",
    baseUrl: "",
    hasApiKey: false,
    maskedApiKey: "",
    status: "ready",
  };

  const MODEL_PRESETS = {
    gemini: [
      { id: "gemini-flash-lite-latest", label: "gemini-flash-lite-latest (Khuyên dùng · Siêu tốc 1s)", isDefault: true },
      { id: "gemini-3.5-flash-lite", label: "gemini-3.5-flash-lite (Rất nhanh)" },
      { id: "gemini-3.8-flash", label: "gemini-3.8-flash (Model mới · Tư duy cao)" },
    ],
    openai: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini (Nhanh & Tiết kiệm)", isDefault: true },
      { id: "gpt-4o", label: "gpt-4o (Thông minh toàn diện)" },
      { id: "gpt-4-turbo", label: "gpt-4-turbo" },
    ],
    custom: [
      { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile (Groq)", isDefault: true },
      { id: "deepseek-chat", label: "deepseek-chat (DeepSeek V3)" },
      { id: "custom", label: "-- Tự gõ Model ID khác --" },
    ],
    anthropic: [
      { id: "claude-3-5-haiku-20241022", label: "claude-3-5-haiku-20241022 (Siêu nhanh)", isDefault: true },
      { id: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet-20241022 (Văn phong cao cấp)" },
    ],
    offline: [],
  };

  const API_KEY_GUIDES = {
    gemini: {
      label: "👉 Lấy Google Gemini API Key miễn phí",
      url: "https://aistudio.google.com/app/apikey",
    },
    openai: {
      label: "👉 Lấy OpenAI API Key",
      url: "https://platform.openai.com/api-keys",
    },
    custom: {
      label: "👉 Lấy Groq API Key miễn phí",
      url: "https://console.groq.com/keys",
    },
    anthropic: {
      label: "👉 Lấy Anthropic API Key",
      url: "https://console.anthropic.com/settings/keys",
    },
    offline: {
      label: "",
      url: "#",
    },
  };

  async function fetchLlmConfig() {
    try {
      const res = await fetch("/api/llm/config");
      if (!res.ok) return;
      currentLlmConfig = await res.json();
      updateLlmUiDisplays();
    } catch (err) {
      console.error("Lỗi tải LLM config:", err);
    }
  }

  function updateLlmUiDisplays() {
    const { provider, model, hasApiKey } = currentLlmConfig;
    const providerCapital = provider === "gemini" ? "Gemini" : provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Claude" : provider === "offline" ? "Offline" : "Custom AI";

    // Header badge
    if (provider === "offline") {
      llmStatusDot.className = "status-dot orange";
      llmStatusText.textContent = "🤖 Offline Mode";
    } else if (hasApiKey) {
      llmStatusDot.className = "status-dot green";
      llmStatusText.textContent = `🤖 ${providerCapital}: ${model}`;
    } else {
      llmStatusDot.className = "status-dot red";
      llmStatusText.textContent = `🤖 ${providerCapital} (Thiếu Key)`;
    }

    // Form Banners
    const bannerText = provider === "offline" ? "Chế độ Offline (Quy tắc cục bộ · Không gọi API ngoài)" : `${providerCapital} · ${model}`;
    if (llmBannerModelUrl) llmBannerModelUrl.textContent = bannerText;
    if (llmBannerModelText) llmBannerModelText.textContent = bannerText;
  }

  function openLlmModal() {
    llmTestResultAlert.style.display = "none";
    inputLlmApiKey.type = "password";
    btnToggleApiKeyEye.textContent = "👁️";

    // Select provider radio
    const activeRadio = document.querySelector(`input[name="llmProviderRadio"][value="${currentLlmConfig.provider}"]`);
    if (activeRadio) {
      activeRadio.checked = true;
      syncProviderCards(currentLlmConfig.provider);
    }

    // Sync API key input
    if (currentLlmConfig.hasApiKey) {
      inputLlmApiKey.value = "";
      inputLlmApiKey.placeholder = `Đã lưu: ${currentLlmConfig.maskedApiKey} (để trống nếu không đổi)`;
      llmKeyStatusBadge.className = "key-status-badge has-key";
      llmKeyStatusBadge.textContent = "✓ Đã có Key";
      llmApiKeyNote.textContent = "Đã lưu khóa API an toàn. Nhập key mới vào đây nếu muốn thay đổi.";
    } else {
      inputLlmApiKey.value = "";
      inputLlmApiKey.placeholder = "Dán API Key vào đây...";
      llmKeyStatusBadge.className = "key-status-badge no-key";
      llmKeyStatusBadge.textContent = "Chưa có Key";
      llmApiKeyNote.textContent = "Chưa có API key. Hãy dán key của bạn vào đây.";
    }

    // Sync Model & Base URL
    inputLlmModelCustom.value = currentLlmConfig.model || "gemini-2.0-flash";
    inputLlmBaseUrl.value = currentLlmConfig.baseUrl || "";

    syncModelPresetsDropdown(currentLlmConfig.provider, currentLlmConfig.model);

    llmModal.style.display = "flex";
  }

  function closeLlmModal() {
    llmModal.style.display = "none";
  }

  function syncProviderCards(provider) {
    document.querySelectorAll(".provider-radio-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.provider === provider);
    });

    // Update help link
    const guide = API_KEY_GUIDES[provider] || API_KEY_GUIDES.gemini;
    if (guide.label) {
      llmGetApiKeyLink.style.display = "inline";
      llmGetApiKeyLink.textContent = guide.label;
      llmGetApiKeyLink.href = guide.url;
    } else {
      llmGetApiKeyLink.style.display = "none";
    }

    // Show/hide fields for offline or custom
    if (provider === "offline") {
      groupLlmApiKey.style.display = "none";
      rowLlmModel.style.display = "none";
      groupLlmBaseUrl.style.display = "none";
    } else {
      groupLlmApiKey.style.display = "block";
      rowLlmModel.style.display = "flex";
      groupLlmBaseUrl.style.display = provider === "custom" ? "block" : "none";
    }
  }

  function syncModelPresetsDropdown(provider, activeModel) {
    selectLlmModelPreset.innerHTML = "";
    const presets = MODEL_PRESETS[provider] || [];

    presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      selectLlmModelPreset.appendChild(opt);
    });

    const optCustom = document.createElement("option");
    optCustom.value = "custom";
    optCustom.textContent = "-- Tự nhập Model ID khác --";
    selectLlmModelPreset.appendChild(optCustom);

    const matchPreset = presets.find((p) => p.id === activeModel);
    if (matchPreset) {
      selectLlmModelPreset.value = matchPreset.id;
    } else {
      selectLlmModelPreset.value = "custom";
    }
  }

  // Radio provider change event
  document.querySelectorAll('input[name="llmProviderRadio"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const prov = e.target.value;
      syncProviderCards(prov);
      const presets = MODEL_PRESETS[prov] || [];
      const defaultModel = presets[0]?.id || "gemini-2.0-flash";
      inputLlmModelCustom.value = defaultModel;
      syncModelPresetsDropdown(prov, defaultModel);
    });
  });

  // Preset dropdown change event
  selectLlmModelPreset.addEventListener("change", (e) => {
    if (e.target.value === "custom") {
      inputLlmModelCustom.focus();
    } else {
      inputLlmModelCustom.value = e.target.value;
    }
  });

  // Eye toggle for API Key
  btnToggleApiKeyEye.addEventListener("click", () => {
    if (inputLlmApiKey.type === "password") {
      inputLlmApiKey.type = "text";
      btnToggleApiKeyEye.textContent = "🔒";
    } else {
      inputLlmApiKey.type = "password";
      btnToggleApiKeyEye.textContent = "👁️";
    }
  });

  // Test Connection Event
  btnTestLlmConnection.addEventListener("click", async () => {
    const selectedProvider = document.querySelector('input[name="llmProviderRadio"]:checked')?.value || "gemini";
    const apiKeyVal = inputLlmApiKey.value.trim();
    const modelVal = inputLlmModelCustom.value.trim();
    const baseUrlVal = inputLlmBaseUrl.value.trim();

    llmTestResultAlert.className = "llm-test-alert testing";
    llmTestResultAlert.style.display = "block";
    llmTestResultAlert.textContent = "⏳ Đang kết nối thử nghiệm đến máy chủ LLM...";
    btnTestLlmConnection.disabled = true;

    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyVal,
          model: modelVal,
          baseUrl: baseUrlVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Kết nối thất bại");
      }

      llmTestResultAlert.className = "llm-test-alert success";
      llmTestResultAlert.innerHTML = `<b>✅ Thành công!</b> ${escapeHtml(data.message)}`;
    } catch (err) {
      llmTestResultAlert.className = "llm-test-alert error";
      llmTestResultAlert.innerHTML = `<b>❌ Thất bại:</b> ${escapeHtml(err.message)}`;
    } finally {
      btnTestLlmConnection.disabled = false;
    }
  });

  // Save Config Event
  btnSaveLlmConfig.addEventListener("click", async () => {
    const selectedProvider = document.querySelector('input[name="llmProviderRadio"]:checked')?.value || "gemini";
    const apiKeyVal = inputLlmApiKey.value.trim();
    const modelVal = inputLlmModelCustom.value.trim();
    const baseUrlVal = inputLlmBaseUrl.value.trim();

    btnSaveLlmConfig.disabled = true;
    btnSaveLlmConfig.textContent = "Đang lưu...";

    try {
      const res = await fetch("/api/llm/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyVal,
          model: modelVal,
          baseUrl: baseUrlVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi lưu cấu hình");

      currentLlmConfig = data;
      updateLlmUiDisplays();
      showToast(`Đã lưu cấu hình LLM: ${selectedProvider} (${modelVal})!`);
      closeLlmModal();
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSaveLlmConfig.disabled = false;
      btnSaveLlmConfig.innerHTML = `<span>💾</span><span>Lưu Cấu Hình</span>`;
    }
  });

  // Open / Close events
  btnOpenLlmModal?.addEventListener("click", openLlmModal);
  llmStatusBadge?.addEventListener("click", openLlmModal);
  btnCloseLlmModal?.addEventListener("click", closeLlmModal);
  btnCancelLlmModal?.addEventListener("click", closeLlmModal);
  llmModal?.addEventListener("click", (e) => {
    if (e.target === llmModal) closeLlmModal();
  });

  // Inline triggers on form banners
  document.querySelectorAll(".btn-trigger-llm-settings").forEach((btn) => {
    btn.addEventListener("click", openLlmModal);
  });

  // ── Creative Mode (100% Automated) ──────────────────────────────────────
  const creativeUrl = document.getElementById("creativeUrl");
  const creativeTranscript = document.getElementById("creativeTranscript");
  const creativeAudioFile = document.getElementById("creativeAudioFile");
  const creativeSrtFile = document.getElementById("creativeSrtFile");
  const creativeAudioStatus = document.getElementById("creativeAudioStatus");
  const creativeAudioPlayer = document.getElementById("creativeAudioPlayer");
  const creativeSrtStatus = document.getElementById("creativeSrtStatus");
  const creativeStylePack = document.getElementById("creativeStylePack");
  const creativeChannel = document.getElementById("creativeChannel");
  const btnSubmitCreative = document.getElementById("btnSubmitCreative");
  const creativeStatusAlert = document.getElementById("creativeStatusAlert");

  let uploadedAudioData = null;

  creativeAudioFile?.addEventListener("change", async () => {
    uploadedAudioData = null;
    if (creativeAudioPlayer) {
      creativeAudioPlayer.pause();
      creativeAudioPlayer.removeAttribute("src");
      creativeAudioPlayer.hidden = true;
    }

    if (!creativeAudioFile.files.length) {
      creativeAudioStatus.textContent = "Chưa chọn file (tối đa 30 MB).";
      creativeAudioStatus.style.color = "";
      return;
    }

    const file = creativeAudioFile.files[0];
    if (!/\.(mp3|wav)$/i.test(file.name)) {
      showToast("Chỉ nhận file âm thanh .mp3 hoặc .wav");
      creativeAudioStatus.textContent = "❌ Định dạng không hỗ trợ. Hãy chọn file .mp3 hoặc .wav";
      creativeAudioStatus.style.color = "#ff4d4f";
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      showToast("File vượt quá 30 MB");
      creativeAudioStatus.textContent = "❌ File vượt quá 30 MB.";
      creativeAudioStatus.style.color = "#ff4d4f";
      return;
    }

    creativeAudioStatus.textContent = `⏳ Đang tải và kiểm tra audio: ${file.name}...`;
    creativeAudioStatus.style.color = "var(--accent-cyan, #00f2fe)";

    try {
      const res = await fetch(`/api/studio/uploads?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-filename": file.name,
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tải lên file âm thanh");

      uploadedAudioData = data;
      creativeAudioStatus.textContent = `✅ Đã nhận: ${data.name} · ${data.durationSec.toFixed(1)} giây`;
      creativeAudioStatus.style.color = "#52c41a";

      if (creativeAudioPlayer && data.audioUrl) {
        creativeAudioPlayer.src = data.audioUrl;
        creativeAudioPlayer.hidden = false;
      }
      showToast(`Đã nhận file âm thanh (${data.durationSec.toFixed(1)}s)`);
    } catch (err) {
      creativeAudioStatus.textContent = `❌ Lỗi: ${err.message}`;
      creativeAudioStatus.style.color = "#ff4d4f";
      showToast(`Lỗi nhận audio: ${err.message}`);
    }
  });

  creativeSrtFile?.addEventListener("change", () => {
    if (creativeSrtFile.files.length) {
      creativeSrtStatus.textContent = `✅ Đã chọn phụ đề: ${creativeSrtFile.files[0].name}`;
      creativeSrtStatus.style.color = "#52c41a";
    } else {
      creativeSrtStatus.textContent = "Nếu có SRT, phụ đề sẽ hiển thị theo cue chính xác. Nếu không, hệ thống tự động căn chỉnh theo khoảng ngắt âm thanh thực tế.";
      creativeSrtStatus.style.color = "";
    }
  });

  btnSubmitCreative?.addEventListener("click", async () => {
    const transcript = creativeTranscript.value.trim();
    if (!transcript) {
      showToast("Vui lòng dán kịch bản lời đọc (voice script)!");
      creativeTranscript.focus();
      return;
    }

    if (!uploadedAudioData && !creativeAudioFile.files.length) {
      showToast("Vui lòng chọn file âm thanh MP3/WAV!");
      creativeAudioFile.focus();
      return;
    }

    const origBtnHtml = btnSubmitCreative.innerHTML;
    btnSubmitCreative.disabled = true;
    btnSubmitCreative.innerHTML = `<span>⏳</span><span>Đang chuẩn bị dữ liệu kịch bản & audio...</span>`;

    try {
      // 1. Ensure audio is uploaded
      let audioUploadId = uploadedAudioData?.uploadId;
      if (!audioUploadId) {
        const audioFile = creativeAudioFile.files[0];
        btnSubmitCreative.innerHTML = `<span>⏳</span><span>Đang tải audio lên hệ thống...</span>`;
        const uploadRes = await fetch(`/api/studio/uploads?name=${encodeURIComponent(audioFile.name)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-filename": audioFile.name,
          },
          body: audioFile,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "Không thể tải lên file âm thanh");
        audioUploadId = uploadData.uploadId;
        uploadedAudioData = uploadData;
      }

      // 2. Read SRT if provided
      let srtContent = undefined;
      if (creativeSrtFile.files.length) {
        srtContent = await creativeSrtFile.files[0].text();
      }

      // 3. Call AI Visual Planner & Builder
      btnSubmitCreative.innerHTML = `<span>🧠</span><span>AI Visual Planner đang chọn bố cục...</span>`;
      const buildRes = await fetch("/api/studio/creative-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: creativeUrl?.value.trim() || "",
          transcript,
          audioUploadId,
          srtContent,
          templatePack: creativeStylePack?.value || "reference",
          channelName: creativeChannel?.value.trim() || "DevPeek36",
        }),
      });

      const buildData = await buildRes.json();
      if (!buildRes.ok) throw new Error(buildData.error || "Lỗi tạo bản dựng Creative");

      if (buildData.alignment?.timingQuality?.mismatchWarning) {
        showToast(buildData.alignment.timingQuality.mismatchWarning);
      }

      // 4. Launch Render Pipeline (Automated 1-click)
      btnSubmitCreative.innerHTML = `<span>🚀</span><span>Khởi động tiến trình render MP4...</span>`;
      await launchPipeline({ script: buildData.script });
      showToast("Bản dựng Creative Mode đã khởi chạy thành công!");
    } catch (err) {
      console.error(err);
      showToast(`Lỗi: ${err.message}`);
    } finally {
      btnSubmitCreative.disabled = false;
      btnSubmitCreative.innerHTML = origBtnHtml;
    }
  });

  // Initial Fetch
  fetchVideoList();
  loadProjectsList();
  fetchLlmConfig();
});
