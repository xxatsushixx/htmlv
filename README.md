# HTML for Video (htmlv) Specification

> [!NOTE]
> This specification is under development. Contributions are welcome!

## Introduction
HTML for Video (htmlv) is a markup language designed to empower web developers to create rich, interactive videos using familiar web development technologies. By extending standard HTML and CSS, htmlv introduces time-based media control, enabling precise manipulation of video content, animations, and transitions. The aim is to bring the flexibility and power of web development to video creation.

## Basic Concepts
- Time-Based Layout: Unlike traditional HTML, which allows infinite vertical scrolling, htmlv operates within fixed screen dimensions determined by the playback environment's aspect ratio. Content is aligned both vertically and horizontally based on this aspect ratio.
- Temporal DOM: In htmlv, the Document Object Model (DOM) represents elements over time. Repeating elements extend the timeline rather than the vertical space, effectively creating a temporal layout.
- Integration with CSS and JavaScript: htmlv utilizes CSS for styling and JavaScript for dynamic DOM manipulation, similar to HTML, but with additional time-based properties and methods.

## Document Structure
An htmlv document resembles an HTML document but includes additional elements and attributes specific to time-based media.

## Example Structure
```html
<!DOCTYPE htmlv>
<html>
<head>
    <title>Sample Video</title>
    <link rel="stylesheet" href="styles.css">
    <script src="script.js"></script>
    <meta name="seed" content="12345">
    <meta name="framerate" content="30fps">
    <meta name="compile-mode" content="precompile">
</head>
<body>
    <scene style="length: 10s; scene-transition: fade 2s;">
        <text class="title">Welcome to htmlv</text>
    </scene>
    <scene style="length: 15s;">
        <video src="intro.mp4"></video>
        <scene>
            <text class="subtitle">Creating videos with code</text>
        </scene>
    </scene>
</body>
</html>
```

## Elements

### <scene>
Defines a temporal segment of the video. Nested <scene> elements create hierarchical timelines.

Attributes:
- style: Includes length, scene-transition, and other time-based properties.

### <text>
Represents text content within a scene.

- Attributes:
  - class: Used for CSS styling.
  - style: Can include time-based properties like start, end, time-position.

### <video>
Embeds a video clip into the scene.

- Attributes:
  -  src: Source file of the video.
  - style: Can include length and other time-based properties.

### <audio>
Embeds an audio clip into the scene.

- Attributes:
  - src: Source file of the audio.
  - style: Can include length and other time-based properties.

## New Elements

### `<ai-generate>`
Generates text, image, audio, video content from prompts or modifies existing media using AI.

- Attributes:
  - target: Target element id to set content.
  - type: MIME type of the content. (e.g., "image/png")
  - prompt: Text description to generate or modify content. (e.g., "red fish in the sea.")
  - seed: Optional seed for caching AI processing.
  - api: Optional API url for generating content.

### `<ai-filter>`
Applies AI-based filters to text, image, audio or video.

- Attributes:
  - target: Target element to apply the filter.
  - type: MIME type of the content. (e.g., "image/png")
  - prompt: Description of what to do. (e.g., "Mask the mountains")
  - seed: Optional seed for caching AI processing.
  - api: Optional API url for generating content.

### `<ai-subtitle>`
Displays subtitles generated from AI-based transcription.

- Attributes:
  - src: Source video or audio for transcription.
  - language: Language of the transcription.
  - target: Target element to set the transcription.
  - seed: Optional seed for caching AI processing.
  - api: Optional API url for generating content.

### `<iframe>`
Embeds another htmlv document within the current one.

- Attributes:
  - src: URL of the htmlv document to embed.
  - style: Includes time-based and layout properties.

## Attributes and Styles

### Time Management Properties
- length: Specifies the duration of an element (e.g., length: 10s; or length: 50%;).
- start: Time offset from the beginning of the parent scene (e.g., start: 5s;).
- end: Time offset to the end of the element within the parent scene (e.g., end: 15s;).
- time-position: Controls the temporal positioning of an element.
- Values: static, relative, absolute, fixed.
- time-margin: Adjusts the starting point of an element relative to its natural start time.
- time-padding: Extends the duration of an element by adding time at the end.
- time-margin-start, time-margin-end: Individual control over start and end margins.
- time-padding-start, time-padding-end: Individual control over start and end padding.

### Transition Effects
To avoid conflicts with existing CSS properties, scene-transition is used to define entry and exit effects for scenes.

- Syntax:
  - scene-transition: effect duration;
  - Negative duration indicates immediate effect without animation.
- Values:
  - fade, zoom, dissolve, flip3d, iris, wipe, slide: Available transition effects.

### Frame Rate Control
- framerate: Specifies the frame rate for the video or scene.
  - Values: e.g., framerate: 30fps;
- framerate-mode: Defines behavior when frame rate is insufficient.
  - Values: slowdown, drop-frames

### Compilation Mode
- compile-mode: Specifies whether to compile before playback or during playback.
  - Values: precompile, compile-during-playback

### Example: Head Element with Global Settings
```html
<head>
    <title>Advanced Video</title>
    <meta name="seed" content="67890">
    <meta name="framerate" content="24fps">
    <meta name="framerate-mode" content="drop-frames">
    <meta name="compile-mode" content="compile-during-playback">
    <link rel="stylesheet" href="styles.css">
</head>
```

## CSS Extensions for htmlv

### Time-Based Pseudo-Classes
- :time(start, end): Applies styles during a specific time range.
  - Example: .logo:time(10s, 12s) { color: blue; }

### New Properties
- length: Duration of an element.
- start: Start time offset within the parent.
- end: End time offset within the parent.
- easing: Timing function for animations.
- scene-transition: Defines the transition effect for scenes.
- time-position: Temporal positioning of elements (static, relative, absolute, fixed).
- time-margin, time-padding, time-margin-start, time-margin-end, time-padding-start, time-padding-end: Control temporal margins and padding.
- loop: How to repeat video or seen until time is filled (none, loop, flipflap, stretch).

### Text Display Controls
- text-display: Controls how text appears over time.
  - Values: character, word, line, block.
- text-duration: Duration over which the text appears.

### Layout Adjustments
- Text and elements will auto-adjust to fit within specified dimensions (width, height), maintaining aspect ratio and readability.

### Example: Time-Based Styling
```css
.logo {
    color: white;
    length: 30s;
    easing: linear;
}

.logo:time(10s, 12s) {
    color: blue;
}

.subtitle {
    text-display: character;
    text-duration: 5s;
    time-position: absolute;
    start: 10s;
}

.scene {
    scene-transition: fade 2s;
}
```

## JavaScript Interaction
JavaScript can manipulate the DOM before rendering begins and during playback.

- Pre-Rendering Manipulation: Modify elements, attributes, and styles before the video is generated.
- Runtime Interaction: Adjust scenes, elements, and playback in response to user input or other events.
- Note: When encoding server-side into standard video formats, only DOM initialization scripts are executed. Interactive features are disabled.

## Examples

### Scene with Transition and Time Adjustments
```html
<scene style="length: 20s; scene-transition: fade 2s;">
    <image src="background.jpg" style="length: 20s;"></image>
    <text class="title" style="start: 2s;">Hello World</text>
</scene>
```

### Lip Sync and Speech Combination

```html
<scene style="length: 15s;">
    <ai-lip-sync src="character.png" audio="speech.mp3" seed="1234" style="length: 15s;"></ai-lip-sync>
    <ai-speech text="Welcome to our presentation." voice="en-US" seed="1234" style="start: 0s;"></ai-speech>
</scene>
```

### Applying Filters and Masks

```html
<scene style="length: 10s;">
    <ai-filter type="anime" target="#portrait" seed="5678" style="length: 10s;"></ai-filter>
    <ai-mask criteria="background" target="#portrait" seed="5678" style="length: 10s;"></ai-mask>
    <image id="portrait" src="person.jpg" style="length: 10s;"></image>
</scene>
```

### AI-Generated Video from Prompt

```html
<scene style="length: 5s;">
    <ai-video prompt="A serene landscape with mountains and a river at sunset" seed="7890" style="length: 5s;"></ai-video>
</scene>
```

### Image Sequence Video

```html
<scene style="length: 5s;">
    <image-sequence src="frames/frame_1.png,frames/frame_2.png,frames/frame_3.png" style="length: 5s; framerate: 24fps;"></image-sequence>
</scene>
```

### Embedding Another htmlv Document

```html
<iframe src="additional_content.htmlv" style="length: 10s;"></iframe>
```

## Conclusion

htmlv extends HTML and CSS to support time-based media, providing a powerful tool for video creation using web technologies. By integrating advanced features like AI-based filters, lip-syncing, text-to-speech, and temporal styling, developers can create rich, dynamic videos with code.
