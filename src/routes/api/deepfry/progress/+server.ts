import type { RequestHandler } from "./$types";

const progressMap = new Map<string, number>();

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get("id");
    if (!id) {
        return new Response("Missing id", { status: 400 });
    }

    const stream = new ReadableStream({
        start(controller) {
            let closed = false;
            let timeoutId: NodeJS.Timeout | null = null;
            function sendProgress() {
                if (closed) return;
                const progress = progressMap.get(id as string) ?? 0;
                try {
                    controller.enqueue(new TextEncoder().encode(`data: ${progress}\n\n`));
                } catch (e) {
                    closed = true;
                    if (timeoutId) clearTimeout(timeoutId);
                    controller.close();
                    return;
                }
                if (progress < 100) {
                    timeoutId = setTimeout(sendProgress, 500);
                } else {
                    closed = true;
                    if (timeoutId) clearTimeout(timeoutId);
                    controller.close();
                }
            }
            sendProgress();
        },
        cancel() {
            closed = true;
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    });
};

export function _setProgress(id: string, percent: number) {
    progressMap.set(id, percent);
    if (percent >= 100) {
        setTimeout(() => progressMap.delete(id), 10000);
    }
}
