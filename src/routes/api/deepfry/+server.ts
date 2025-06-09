import type { RequestHandler } from "./$types";
import { tmpNameSync } from "tmp";
import { promises as fs } from "fs";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { error } from "@sveltejs/kit";
import { _setProgress } from "./progress/+server";
import { randomUUID } from "crypto";

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
		}
	});
};

export const POST: RequestHandler = async ({ request, url }) => {
    console.log("[deepfry] New request received");
    const contentType = request.headers.get('content-type') || '';
    let files = [];
    let fryLevel = 3;
    let progressId = url.searchParams.get("progressId") || randomUUID();

    if (contentType.startsWith('multipart/form-data')) {
        const formData = await request.formData();
        fryLevel = parseInt(formData.get('level')?.toString() ?? '3');
        files = Array.from(formData.getAll('files')).map((file: any) => ({
            name: file.name,
            type: file.type,
            data: file
        }));
        progressId = formData.get('progressId')?.toString() || progressId;
        console.log(`[deepfry] Parsed multipart form: ${files.length} file(s), level ${fryLevel}`);
    } else {
        const body = await request.json();
        files = Array.isArray(body.files) ? body.files : [];
        fryLevel = parseInt(url.searchParams.get("level") ?? body.level ?? "3");
        files = files.map((file: any) => ({
            ...file,
            data: Buffer.from(file.data, 'base64')
        }));
        progressId = body.progressId || progressId;
        console.log(`[deepfry] Parsed JSON: ${files.length} file(s), level ${fryLevel}`);
    }

    if (!files.length) {
        console.log("[deepfry] No files provided");
        throw error(400, "Missing file(s)");
    }

    _setProgress(progressId, 0);
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = path.extname(file.name).toLowerCase();
        const tempInput = tmpNameSync({ postfix: ext });
        const tempOutput = tmpNameSync({ postfix: ext });

        const buffer = file.data instanceof Buffer ? file.data : Buffer.from(await file.data.arrayBuffer());
        await fs.writeFile(tempInput, buffer);

        try {
            console.log(`[deepfry] Processing file: ${file.name} (${ext}), level ${fryLevel}`);
            const updateProgress = (percent: number) => {
                _setProgress(progressId, Math.round(((i + percent / 100) / files.length) * 100));
            };
            if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
                await deepfryImage(tempInput, tempOutput, fryLevel);
                updateProgress(100);
                console.log(`[deepfry] Image deepfried: ${file.name}`);
            } else if (
                [".mp3", ".wav", ".ogg", ".flac", ".m4a"].includes(ext)
            ) {
                await deepfryAudio(tempInput, tempOutput, fryLevel, updateProgress);
                console.log(`[deepfry] Audio deepfried: ${file.name}`);
            } else if ([".mp4", ".mov", ".webm", ".mkv"].includes(ext)) {
                await deepfryVideo(tempInput, tempOutput, fryLevel, updateProgress);
                console.log(`[deepfry] Video deepfried: ${file.name}`);
            } else {
                console.log(`[deepfry] Unsupported file type: ${file.name}`);
                throw error(400, "Unsupported file type");
            }

            const outputData = await fs.readFile(tempOutput);
            results.push({
                data: outputData,
                type: file.type || "application/octet-stream",
                name: file.name,
            });
        } finally {
            fs.unlink(tempInput).catch(() => {});
            fs.unlink(tempOutput).catch(() => {});
        }
    }

    _setProgress(progressId, 100);
    if (results.length === 1) {
        console.log(`[deepfry] Returning single file: ${results[0].name}`);
        return new Response(results[0].data, {
            status: 200,
            headers: {
                'Content-Type': results[0].type,
                'Content-Disposition': `attachment; filename=\"deepfried-${results[0].name}\"`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    } else {
        console.log(`[deepfry] Returning ${results.length} files as JSON array`);
        return new Response(JSON.stringify(results.map(r => ({
            data: Array.from(r.data),
            type: r.type,
            name: r.name
        }))), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
};

async function deepfryImage(input: string, output: string, level: number) {
    const image = sharp(input).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({
        resolveWithObject: true,
    });

    const rgba = Buffer.from(data);
    const alpha = Buffer.alloc(info.width * info.height);
    for (let i = 0; i < alpha.length; i++) {
        alpha[i] = rgba[i * 4 + 3];
        rgba[i * 4 + 3] = 255;
    }

    const tempJpeg = tmpNameSync({ postfix: ".jpg" });

    const quality = Math.max(1, Math.min(100, Math.round(10 + 10 / level)));

    await sharp(rgba, {
        raw: { width: info.width, height: info.height, channels: 4 },
    })
        .jpeg({ quality })
        .modulate({ saturation: 2 * level })
        .sharpen(level)
        .toFile(tempJpeg);

    await sharp(tempJpeg)
        .composite([
            {
                input: alphaToBuffer(alpha, info.width, info.height),
                raw: { width: info.width, height: info.height, channels: 4 },
                blend: "dest-in",
            },
        ])
        .png()
        .toFile(output);
}

function alphaToBuffer(alpha: Buffer, width: number, height: number): Buffer {
    const buf = Buffer.alloc(width * height * 4);
    for (let i = 0; i < alpha.length; i++) {
        buf[i * 4 + 0] = 255;
        buf[i * 4 + 1] = 255;
        buf[i * 4 + 2] = 255;
        buf[i * 4 + 3] = alpha[i];
    }
    return buf;
}

function getDeepfryAudioFilters(level: number): string[] {
    const lvl = Math.max(1, Math.min(10, level));
    const gain = 2 + lvl * 1.2;
    const bass = 4 + lvl * 1.5;
    const treble = 2 + lvl * 1.2;
    const echoDelay1 = 30 + lvl * 4;
    const echoDelay2 = 90 + lvl * 10;
    const resampleRate = Math.max(4000, 12000 - lvl * 800);
    const highpass = 80 + lvl * 20;
    const lowpass = Math.max(2000, 9000 - lvl * 700);
    const chorusDepth = 50 + lvl * 3;
    const chorusVoices = 2 + Math.floor(lvl / 4);
    // const compandPoints = `-80/-900|-40/-40|0/-${10 + lvl * 2}`;

    return [
        // `compand=attacks=0:points=${compandPoints}`,
        `bass=g=${bass}:f=70:w=0.6`,
        `treble=g=${treble}`,
        `aphaser=type=t:speed=0.6:decay=0.7`,
        `chorus=0.6:0.9:${chorusDepth}:0.4:0.25:${chorusVoices}`,
        `aresample=${resampleRate}`,
        `aecho=0.8:0.88:${echoDelay1}|${echoDelay2}:0.5|0.4`,
        `highpass=f=${highpass}`,
        `lowpass=f=${lowpass}`,
        `volume=${gain}`,
        `dynaudnorm=f=150:g=7:p=0.9` 
    ];
}

async function deepfryAudio(input: string, output: string, level: number, onProgress?: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const filters = getDeepfryAudioFilters(level);
        ffmpeg(input)
            .audioFilters(filters)
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .format('mp3')
            .on('progress', (progress) => {
                if (onProgress && typeof progress.percent === 'number') {
                    onProgress(progress.percent);
                }
                console.log(`[deepfry] Audio progress: ${progress.percent !== undefined ? progress.percent.toFixed(1) : '?'}%`, progress.timemark ? `at ${progress.timemark}` : '');
            })
            .on('end', () => resolve())
            .on('error', reject)
            .save(output);
    });
}

async function deepfryVideo(
    input: string,
    output: string,
    level: number,
    onProgress?: (percent: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const unsharpLevel = Math.max(-2, Math.min(5, level));
        const filters = [
            `eq=saturation=${1.5 * level}:contrast=${1 + 0.3 * level}`,
            `unsharp=5:5:${unsharpLevel}`,
            `scale=iw*0.75:ih*0.75`,
            `scale=iw*1.25:ih*1.25`,
            `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
            `hue=s=2`,
        ];

        const ext = path.extname(output).slice(1);
        const crf = Math.max(10, Math.min(51, 35 - level * 5));

        const command = ffmpeg(input)
            .videoFilters(filters)
            .audioFilters(getDeepfryAudioFilters(level))
            .outputOptions(["-crf", `${crf}`])
            .outputFormat(ext);

        if (ext === "mp4") {
            command
                .videoCodec("libx264")
                .audioCodec("aac")
                .outputOptions(["-pix_fmt", "yuv420p"]);
        }

        command
            .on("stderr", (line) => console.log("ffmpeg stderr:", line))
            .on('progress', (progress) => {
                if (onProgress && typeof progress.percent === 'number') {
                    onProgress(progress.percent);
                }
                console.log(`[deepfry] Video progress: ${progress.percent !== undefined ? progress.percent.toFixed(1) : '?'}%`, progress.timemark ? `at ${progress.timemark}` : '');
            })
            .on("end", () => resolve())
            .on("error", reject)
            .save(output);
    });
}

