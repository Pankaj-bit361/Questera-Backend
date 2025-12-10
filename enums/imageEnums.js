// Available aspect ratios for image generation
const ASPECT_RATIOS = [
    'auto',   // Default - automatically determine best ratio
    '1:1',    // Square
    '16:9',   // Widescreen landscape
    '9:16',   // Vertical/Portrait (mobile)
    '4:3',    // Standard landscape
    '3:4',    // Standard portrait
    '3:2',    // Classic photo landscape
    '2:3',    // Classic photo portrait
    '5:4',    // Large format landscape
    '4:5',    // Large format portrait
    '21:9',   // Ultra-wide cinematic
];

// Available image sizes/resolutions
const IMAGE_SIZES = ['4K', '2K', '1K'];

// Available styles for image generation
const STYLES = [
    'none',
    'Realistic',
    'Anime',
    'Digital Art',
    'Oil Painting',
    '3D Render',
    'Watercolor',
    'Sketch',
];

module.exports = {
    ASPECT_RATIOS,
    IMAGE_SIZES,
    STYLES
};