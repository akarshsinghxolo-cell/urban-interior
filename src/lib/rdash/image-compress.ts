export function compressImage(file: File, maxSize = 800, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxSize) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                }
                else if (height > maxSize) {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(reader.result as string);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                // STAGE-5-FIX (5.5): Release canvas bitmap memory + img
                // reference. Without this, mobile browsers (especially iOS
                // Safari) retain the canvas bitmap in memory, causing OOM
                // crashes after 5-10 sequential photo uploads.
                canvas.width = 0;
                canvas.height = 0;
                img.src = "";
                img.onload = null;
                img.onerror = null;
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}
