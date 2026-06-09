/**
 * Notulensi AI - Main App
 * UI logic, state management, file queue management
 */

const App = {
  state: {
    files: [],        // { id, file, status, transcript, notulensi, progress, error }
    activeFileId: null,
    isProcessing: false,
    currentTranscriber: null,
  },

  init() {
    this.bindEvents();
    this.loadSettings();
    this.renderFileList();
    this.showTab('transkrip');
  },

  // ─── Settings ─────────────────────────────────────────────────────────────

  loadSettings() {
    const saved = localStorage.getItem('notulensi_settings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.openaiKey) document.getElementById('openai-key').value = s.openaiKey;
        if (s.anthropicKey) document.getElementById('anthropic-key').value = s.anthropicKey;
        if (s.language) document.getElementById('language').value = s.language;
      } catch (_) {}
    }
  },

  saveSettings() {
    const settings = {
      openaiKey: document.getElementById('openai-key').value.trim(),
      anthropicKey: document.getElementById('anthropic-key').value.trim(),
      language: document.getElementById('language').value,
    };
    localStorage.setItem('notulensi_settings', JSON.stringify(settings));
    this.showToast('Pengaturan tersimpan!', 'success');
  },

  // ─── Event Binding ────────────────────────────────────────────────────────

  bindEvents() {
    // Drop zone
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      this.addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', (e) => {
      this.addFiles(Array.from(e.target.files));
      fileInput.value = '';
    });

    // Buttons
    document.getElementById('btn-transcribe-all').addEventListener('click', () => this.transcribeAll());
    document.getElementById('btn-cancel').addEventListener('click', () => this.cancelCurrent());
    document.getElementById('btn-clear-done').addEventListener('click', () => this.clearDone());
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-generate-notulensi').addEventListener('click', () => this.generateNotulensi());
    document.getElementById('btn-copy-transcript').addEventListener('click', () => this.copyActiveTranscript());
    document.getElementById('btn-copy-notulensi').addEventListener('click', () => this.copyActiveNotulensi());
    document.getElementById('btn-download-transcript').addEventListener('click', () => this.downloadActiveTranscript());
    document.getElementById('btn-download-notulensi').addEventListener('click', () => this.downloadActiveNotulensi());

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
    });

    // Toggle password visibility
    document.querySelectorAll('.toggle-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });
  },

  // ─── File Management ──────────────────────────────────────────────────────

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  addFiles(files) {
    const audioTypes = ['audio/', 'video/mp4', 'video/webm', 'video/ogg'];
    const valid = files.filter(f => audioTypes.some(t => f.type.startsWith(t)));
    const invalid = files.filter(f => !audioTypes.some(t => f.type.startsWith(t)));

    if (invalid.length > 0) {
      this.showToast(`${invalid.length} file diabaikan (bukan file audio)`, 'warning');
    }

    valid.forEach(file => {
      const id = this.generateId();
      this.state.files.push({
        id,
        file,
        status: 'pending', // pending | processing | done | error | cancelled
        transcript: '',
        notulensi: '',
        progress: { phase: '', percent: 0, message: '' },
        error: null,
      });
    });

    this.renderFileList();
    if (valid.length > 0 && !this.state.activeFileId) {
      this.setActiveFile(this.state.files[0].id);
    }
  },

  removeFile(id) {
    this.state.files = this.state.files.filter(f => f.id !== id);
    if (this.state.activeFileId === id) {
      this.state.activeFileId = this.state.files[0]?.id || null;
    }
    this.renderFileList();
    this.renderActiveFile();
  },

  setActiveFile(id) {
    this.state.activeFileId = id;
    this.renderFileList();
    this.renderActiveFile();
  },

  getActiveFile() {
    return this.state.files.find(f => f.id === this.state.activeFileId);
  },

  clearDone() {
    this.state.files = this.state.files.filter(f => f.status !== 'done' && f.status !== 'error' && f.status !== 'cancelled');
    if (!this.state.files.find(f => f.id === this.state.activeFileId)) {
      this.state.activeFileId = this.state.files[0]?.id || null;
    }
    this.renderFileList();
    this.renderActiveFile();
  },

  // ─── Transcription ────────────────────────────────────────────────────────

  async transcribeAll() {
    if (this.state.isProcessing) return;

    const apiKey = document.getElementById('openai-key').value.trim();
    if (!apiKey) {
      this.showToast('Masukkan OpenAI API Key di pengaturan terlebih dahulu!', 'error');
      this.showTab('pengaturan');
      return;
    }

    const pending = this.state.files.filter(f => f.status === 'pending');
    if (pending.length === 0) {
      this.showToast('Tidak ada file yang menunggu diproses', 'warning');
      return;
    }

    this.state.isProcessing = true;
    this.updateUI();

    const language = document.getElementById('language').value;
    const chunkDuration = parseInt(document.getElementById('chunk-duration').value) || 55;

    for (const fileObj of pending) {
      if (this.state.isProcessing === false) break; // cancelled via flag
      await this.transcribeFile(fileObj.id, apiKey, language, chunkDuration);
    }

    this.state.isProcessing = false;
    this.state.currentTranscriber = null;
    this.updateUI();
  },

  async transcribeFile(id, apiKey, language, chunkDuration) {
    const fileObj = this.state.files.find(f => f.id === id);
    if (!fileObj) return;

    fileObj.status = 'processing';
    fileObj.error = null;
    this.setActiveFile(id);
    this.renderFileList();

    const transcriber = new AudioTranscriber({
      chunkDuration,
      onProgress: (prog) => {
        fileObj.progress = prog;
        if (this.state.activeFileId === id) this.renderProgress(prog);
        this.renderFileList();
      },
      onChunkDone: (chunk) => {
        // Append chunk text to live preview
        if (this.state.activeFileId === id) {
          this.appendLiveTranscript(chunk.text);
        }
      },
      onError: (err) => {
        fileObj.status = 'error';
        fileObj.error = err.message;
        this.renderFileList();
        this.renderActiveFile();
      },
    });

    this.state.currentTranscriber = transcriber;

    // Clear live transcript
    const liveBox = document.getElementById('live-transcript');
    if (liveBox) liveBox.textContent = '';

    try {
      const transcript = await transcriber.transcribe(fileObj.file, {
        method: 'whisper',
        apiKey,
        language,
      });

      fileObj.transcript = transcript;
      fileObj.status = 'done';
      fileObj.progress = { phase: 'done', percent: 100, message: 'Selesai!' };
    } catch (e) {
      if (e.message.includes('dibatalkan')) {
        fileObj.status = 'cancelled';
      } else {
        fileObj.status = 'error';
        fileObj.error = e.message;
      }
    }

    this.renderFileList();
    this.renderActiveFile();
  },

  cancelCurrent() {
    if (this.state.currentTranscriber) {
      this.state.currentTranscriber.cancel();
    }
    this.state.isProcessing = false;
    this.updateUI();
    this.showToast('Transkripsi dibatalkan', 'warning');
  },

  // ─── Notulensi Generation ─────────────────────────────────────────────────

  async generateNotulensi() {
    const active = this.getActiveFile();
    if (!active || !active.transcript) {
      this.showToast('Belum ada transkrip untuk file ini', 'warning');
      return;
    }

    const apiKey = document.getElementById('anthropic-key').value.trim();
    if (!apiKey) {
      this.showToast('Masukkan Anthropic API Key untuk fitur notulensi!', 'error');
      this.showTab('pengaturan');
      return;
    }

    const btn = document.getElementById('btn-generate-notulensi');
    btn.disabled = true;
    btn.textContent = '⏳ Membuat notulensi...';

    const notulensiBox = document.getElementById('notulensi-output');
    notulensiBox.textContent = 'Menghubungi Claude AI...';

    try {
      const generator = new NotulensiGenerator();
      const result = await generator.generate(active.transcript, {
        apiKey,
        meetingTitle: document.getElementById('meeting-title').value,
        meetingDate: document.getElementById('meeting-date').value,
        attendees: document.getElementById('meeting-attendees').value,
        additionalContext: document.getElementById('meeting-context').value,
      });

      active.notulensi = result;
      this.renderActiveFile();
      this.showToast('Notulensi berhasil dibuat!', 'success');
    } catch (e) {
      notulensiBox.textContent = `Error: ${e.message}`;
      this.showToast(`Gagal membuat notulensi: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Buat Notulensi';
    }
  },

  // ─── Rendering ────────────────────────────────────────────────────────────

  renderFileList() {
    const container = document.getElementById('file-list');
    if (this.state.files.length === 0) {
      container.innerHTML = `<div class="file-list-empty">Belum ada file. Upload audio di atas.</div>`;
      return;
    }

    container.innerHTML = this.state.files.map(f => {
      const isActive = f.id === this.state.activeFileId;
      const statusIcon = { pending: '⏳', processing: '🔄', done: '✅', error: '❌', cancelled: '⛔' }[f.status] || '⏳';
      const statusClass = f.status;
      const sizeMB = (f.file.size / 1024 / 1024).toFixed(1);

      let progressBar = '';
      if (f.status === 'processing') {
        const pct = f.progress?.percent || 0;
        progressBar = `<div class="file-progress-bar"><div class="file-progress-fill" style="width:${pct}%"></div></div>`;
      }

      return `
        <div class="file-item ${isActive ? 'active' : ''} ${statusClass}" onclick="App.setActiveFile('${f.id}')">
          <div class="file-item-header">
            <span class="file-status-icon">${statusIcon}</span>
            <span class="file-name" title="${f.file.name}">${f.file.name}</span>
            <button class="file-remove-btn" onclick="event.stopPropagation(); App.removeFile('${f.id}')" title="Hapus">×</button>
          </div>
          <div class="file-meta">${sizeMB} MB ${f.status === 'processing' ? `• ${f.progress?.message || ''}` : ''}</div>
          ${progressBar}
        </div>`;
    }).join('');
  },

  renderActiveFile() {
    const active = this.getActiveFile();

    // Transcript
    const transcriptBox = document.getElementById('transcript-output');
    const liveBox = document.getElementById('live-transcript');
    const progressSection = document.getElementById('progress-section');

    if (!active) {
      transcriptBox.textContent = '';
      liveBox.textContent = '';
      progressSection.style.display = 'none';
      return;
    }

    const liveLabel = document.getElementById('live-label');
    if (active.status === 'processing') {
      transcriptBox.style.display = 'none';
      liveBox.style.display = 'block';
      if (liveLabel) liveLabel.style.display = 'flex';
      progressSection.style.display = 'block';
      this.renderProgress(active.progress);
    } else {
      transcriptBox.style.display = 'block';
      liveBox.style.display = 'none';
      if (liveLabel) liveLabel.style.display = 'none';
      progressSection.style.display = 'none';
      transcriptBox.textContent = active.transcript || (
        active.status === 'error' ? `Error: ${active.error}` :
        active.status === 'cancelled' ? 'Transkripsi dibatalkan.' :
        active.status === 'pending' ? 'Belum diproses. Klik "Mulai Transkripsi" untuk memulai.' : ''
      );
    }

    // Notulensi
    const notulensiBox = document.getElementById('notulensi-output');
    if (active.notulensi) {
      notulensiBox.innerHTML = this.renderMarkdown(active.notulensi);
    } else {
      notulensiBox.textContent = 'Notulensi belum dibuat. Klik "Buat Notulensi" setelah transkrip selesai.';
    }

    // Update file info header
    const fileInfo = document.getElementById('active-file-info');
    if (fileInfo) fileInfo.textContent = active.file.name;
  },

  appendLiveTranscript(text) {
    const liveBox = document.getElementById('live-transcript');
    if (!liveBox) return;
    if (text) {
      liveBox.textContent += (liveBox.textContent ? ' ' : '') + text;
      liveBox.scrollTop = liveBox.scrollHeight;
    }
  },

  renderProgress(prog) {
    const bar = document.getElementById('progress-bar-fill');
    const msg = document.getElementById('progress-message');
    if (bar) bar.style.width = `${prog.percent || 0}%`;
    if (msg) msg.textContent = prog.message || '';
  },

  renderMarkdown(text) {
    // Simple markdown renderer for notulensi
    return text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  },

  showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  },

  updateUI() {
    const processing = this.state.isProcessing;
    document.getElementById('btn-transcribe-all').disabled = processing;
    document.getElementById('btn-transcribe-all').textContent = processing ? '⏳ Memproses...' : '▶ Mulai Transkripsi';
    document.getElementById('btn-cancel').style.display = processing ? 'inline-flex' : 'none';
  },

  // ─── Copy / Download ──────────────────────────────────────────────────────

  copyActiveTranscript() {
    const active = this.getActiveFile();
    if (!active?.transcript) return this.showToast('Belum ada transkrip', 'warning');
    navigator.clipboard.writeText(active.transcript).then(() => this.showToast('Transkrip disalin!', 'success'));
  },

  copyActiveNotulensi() {
    const active = this.getActiveFile();
    if (!active?.notulensi) return this.showToast('Belum ada notulensi', 'warning');
    navigator.clipboard.writeText(active.notulensi).then(() => this.showToast('Notulensi disalin!', 'success'));
  },

  downloadActiveTranscript() {
    const active = this.getActiveFile();
    if (!active?.transcript) return this.showToast('Belum ada transkrip', 'warning');
    const name = active.file.name.replace(/\.[^.]+$/, '') + '_transkrip.txt';
    this.downloadText(active.transcript, name);
  },

  downloadActiveNotulensi() {
    const active = this.getActiveFile();
    if (!active?.notulensi) return this.showToast('Belum ada notulensi', 'warning');
    const name = active.file.name.replace(/\.[^.]+$/, '') + '_notulensi.md';
    this.downloadText(active.notulensi, name);
  },

  downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── Toast Notifications ──────────────────────────────────────────────────

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());
