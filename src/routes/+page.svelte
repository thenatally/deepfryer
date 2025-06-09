<script lang="ts">
  import { onDestroy } from 'svelte';

  let files: FileList | null = null;
  let fileList: File[] = [];
  let level = 3;
  let frying = false;
  let resultUrls: string[] = [];
  let error: string | null = null;
  let fileInputRef: HTMLInputElement | null = null;
  let progress = 0;
  let progressId: string | null = null;
  let eventSource: EventSource | null = null;

  function triggerFileInput() {
    fileInputRef?.click();
  }

  function handleFileChange() {
    fileList = files ? Array.from(files) : [];
  }

  function generateProgressId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  onDestroy(() => {
    if (eventSource) eventSource.close();
  });

  async function handleDeepfry() {
    if (!fileList.length) {
      error = 'No files selected!';
      return;
    }

    frying = true;
    error = null;
    resultUrls = [];
    progress = 0;
    progressId = generateProgressId();

    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/deepfry/progress?id=${progressId}`);
    eventSource.onmessage = (e) => {
      progress = parseInt(e.data);
      if (progress >= 100) {
        eventSource?.close();
      }
    };

    const formData = new FormData();
    fileList.forEach((file) => {
      formData.append('files', file, file.name);
    });
    formData.append('level', String(level));
    formData.append('progressId', progressId!);

    try {
      const res = await fetch(`/api/deepfry?progressId=${progressId}`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.startsWith('application/json')) {
        const blobs = await res.json();
        resultUrls = blobs.map((b: any) => {
          const blob = new Blob([Uint8Array.from(b.data)], { type: b.type });
          return URL.createObjectURL(blob);
        });
      } else if (contentType.startsWith('application/zip')) {
        const blob = await res.blob();
        resultUrls = [URL.createObjectURL(blob)];
      } else if (contentType.startsWith('multipart/')) {
        error = 'Multipart response not yet supported.';
      } else {
        const blob = await res.blob();
        resultUrls = [URL.createObjectURL(blob)];
      }
    } catch (err: any) {
      error = err.message || 'Something fried wrong.';
    } finally {
      frying = false;
    }
  }
</script>

<div
  class="mx-auto mt-10 max-w-xl space-y-6 rounded-2xl border border-zinc-200 bg-gradient-to-br from-yellow-50 via-zinc-100 to-yellow-100 px-4 py-6 shadow-xl transition-colors duration-300 dark:border-zinc-700 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900"
>
  <h1 class="text-center text-3xl font-bold text-yellow-500 drop-shadow-lg dark:text-yellow-300">
    Deepfry things!!!!
  </h1>

  <div class="space-y-4">
    <div class="space-y-1">
      <input
        id="file-input"
        type="file"
        class="hidden"
        bind:files
        bind:this={fileInputRef}
        multiple
        on:change={handleFileChange}
      />
      <button
        type="button"
        on:click={triggerFileInput}
        class="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-400 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-yellow-500 dark:border-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-500"
      >
        <svg
          aria-hidden="true"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
        >
          <path
            stroke-width="2"
            stroke="#ffffff"
            d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
            stroke-linejoin="round"
            stroke-linecap="round"
          ></path>
          <path
            stroke-linejoin="round"
            stroke-linecap="round"
            stroke-width="2"
            stroke="#ffffff"
            d="M17 15V18M17 21V18M17 18H14M17 18H20"
          ></path>
        </svg>
        Add Files
      </button>
      {#if fileList.length}
        <div class="mt-2 space-y-2">
          <h3 class="text-base font-semibold text-zinc-700 dark:text-zinc-200">
            Original Files Preview:
          </h3>
          {#each fileList as f, i}
            <div>
              <p class="truncate font-medium text-zinc-800 dark:text-zinc-100">{f.name}</p>

              {#if f.type.startsWith('image/')}
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  class="mx-auto max-w-xs rounded-lg border border-zinc-200 shadow dark:border-zinc-700"
                />
              {:else if f.type.startsWith('video/')}
                <video
                  controls
                  src={URL.createObjectURL(f)}
                  class="mx-auto max-w-xs rounded-lg border border-zinc-200 shadow dark:border-zinc-700"
                >
                  <track kind="captions" label="No captions" />
                </video>
              {:else if f.type.startsWith('audio/')}
                <audio controls src={URL.createObjectURL(f)} class="w-full"></audio>
              {:else}
                <a
                  href={URL.createObjectURL(f)}
                  download={f.name}
                  class="block text-blue-600 hover:underline dark:text-blue-400"
                  >Download {f.name}</a
                >
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div>
      <label
        for="level-range"
        class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >Deepfry Level: <span class="font-bold text-yellow-600 dark:text-yellow-300">{level}</span
        ></label
      >
      <input
        id="level-range"
        type="range"
        min="1"
        max="10"
        step="1"
        bind:value={level}
        class="w-full accent-yellow-500 transition-colors dark:accent-yellow-400"
      />
    </div>

    {#if frying}
      <div
        class="relative flex h-10 w-full items-center justify-between overflow-hidden rounded-lg border border-yellow-300 bg-yellow-100 px-4 text-sm font-semibold text-yellow-900 shadow-inner transition-all dark:border-yellow-700 dark:bg-yellow-900 dark:text-yellow-100"
      >
        <div
          class="absolute top-0 left-0 h-full bg-yellow-400 transition-all duration-300 ease-in-out dark:bg-yellow-600"
          style="width: {progress}%; z-index: 0;"
        ></div>
        <span class="relative z-10">Frying...</span>
        <span class="relative z-10">{progress}%</span>
      </div>
    {:else}
      <button
        type="button"
        class="flex h-10 w-full items-center justify-between rounded-lg border border-yellow-300 bg-yellow-400 px-4 text-sm font-semibold text-white shadow-md transition-all hover:bg-yellow-500 disabled:opacity-50 dark:border-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-500"
        disabled={!fileList.length}
        on:click={handleDeepfry}
      >
        <span>Deepfry</span>
        <span></span>
      </button>
    {/if}
  </div>

  {#if error}
    <p class="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
  {/if}

  {#if resultUrls.length}
    <div class="mt-6 space-y-2">
      <h2 class="text-center text-xl font-semibold text-green-700 dark:text-green-300">
        Deepfried
      </h2>
      {#each resultUrls as url, i}
        {#if fileList[i]?.type.startsWith('image/')}
          <img
            src={url}
            alt="Deepfried"
            class="mx-auto max-w-full rounded-lg border border-yellow-200 shadow-md dark:border-yellow-700"
          />
        {:else if fileList[i]?.type.startsWith('video/')}
          <video
            controls
            src={url}
            class="mx-auto max-w-full rounded-lg border border-yellow-200 shadow-md dark:border-yellow-700"
          >
            <track kind="captions" label="No captions" />
          </video>
        {:else if fileList[i]?.type.startsWith('audio/')}
          <audio controls src={url} class="w-full"></audio>
        {:else}
          <a
            href={url}
            download={fileList[i]?.name || 'deepfried'}
            class="block text-center text-blue-600 hover:underline dark:text-blue-400"
          >
            Download Deepfried File
          </a>
        {/if}
      {/each}
    </div>
  {/if}
</div>
