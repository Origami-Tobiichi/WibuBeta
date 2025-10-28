// Simple EXIF handler untuk sticker
module.exports = {
    imageToWebp: async (buffer) => {
        return buffer;
    },
    videoToWebp: async (buffer) => {
        return buffer;
    },
    writeExifImg: async (image, metadata) => {
        return image;
    },
    writeExifVid: async (video, metadata) => {
        return video;
    }
};