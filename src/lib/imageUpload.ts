export async function readAndCompressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.82
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a PNG, JPEG, or WebP image file.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Empty image data.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Could not process image file.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        let dataUrl = canvas.toDataURL(outputMime, quality);
        if (dataUrl.length > 1_400_000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        }
        if (dataUrl.length > 1_500_000) {
          reject(new Error('Image is still too large after compression. Please use a smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
