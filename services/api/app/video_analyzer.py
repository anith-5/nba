"""
Video biomechanical analyzer — MediaPipe Pose + OpenCV.
Extracts player tendencies from MP4/MOV footage for scouting reports.
"""

from __future__ import annotations

import math
import tempfile
import os
from dataclasses import dataclass, field
from typing import Optional

try:
    import cv2
    import mediapipe as mp
    import numpy as np
    CV_AVAILABLE = True
except ImportError:
    CV_AVAILABLE = False

# MediaPipe landmark indices
_LM = {
    "nose": 0,
    "l_shoulder": 11, "r_shoulder": 12,
    "l_elbow": 13,    "r_elbow": 14,
    "l_wrist": 15,    "r_wrist": 16,
    "l_hip": 23,      "r_hip": 24,
    "l_knee": 25,     "r_knee": 26,
    "l_ankle": 27,    "r_ankle": 28,
}

MAX_FRAMES = 600   # never process more than this many sampled frames
SAMPLE_RATE = 5    # analyze every 5th frame


@dataclass
class FrameData:
    r_elbow_angle: float = 180.0
    l_elbow_angle: float = 180.0
    r_knee_angle:  float = 180.0
    l_knee_angle:  float = 180.0
    r_wrist_y:     float = 0.5    # normalized 0-1, 0 = top of frame
    l_wrist_y:     float = 0.5
    com_x:         float = 0.5    # center of mass x (0=left, 1=right)
    com_y:         float = 0.5
    visibility:    float = 0.0    # avg landmark visibility


@dataclass
class VideoMetrics:
    dominant_hand:      str   = "right"
    drive_direction:    str   = "balanced"
    avg_r_elbow_angle:  float = 90.0   # shooting elbow (degrees)
    avg_l_elbow_angle:  float = 90.0
    avg_knee_bend:      float = 150.0  # avg of both knees in active phases
    jump_count:         int   = 0
    shot_count:         int   = 0      # estimated shots (jump + arm extension)
    release_height:     str   = "high"
    movement_pace:      str   = "moderate"
    lateral_quickness:  str   = "moderate"
    frames_analyzed:    int   = 0
    total_frames:       int   = 0
    fps:                float = 30.0
    duration_seconds:   float = 0.0
    confidence:         float = 0.0    # 0-1 how reliable the analysis is
    raw_notes:          list  = field(default_factory=list)


def _angle(a, b, c) -> float:
    """Angle at vertex b given points a, b, c as (x, y) tuples."""
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    mag_ba = math.hypot(*ba)
    mag_bc = math.hypot(*bc)
    if mag_ba < 1e-6 or mag_bc < 1e-6:
        return 180.0
    cos_a = (ba[0] * bc[0] + ba[1] * bc[1]) / (mag_ba * mag_bc)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos_a))))


def _lm(landmarks, key: str, w: int, h: int) -> tuple[float, float]:
    l = landmarks[_LM[key]]
    return l.x * w, l.y * h


def _vis(landmarks, *keys) -> float:
    return sum(landmarks[_LM[k]].visibility for k in keys) / len(keys)


def _extract_frame(landmarks, w: int, h: int) -> FrameData:
    fd = FrameData()

    # Elbow angles
    fd.r_elbow_angle = _angle(
        _lm(landmarks, "r_shoulder", w, h),
        _lm(landmarks, "r_elbow", w, h),
        _lm(landmarks, "r_wrist", w, h),
    )
    fd.l_elbow_angle = _angle(
        _lm(landmarks, "l_shoulder", w, h),
        _lm(landmarks, "l_elbow", w, h),
        _lm(landmarks, "l_wrist", w, h),
    )

    # Knee angles (straighter = less bent)
    fd.r_knee_angle = _angle(
        _lm(landmarks, "r_hip", w, h),
        _lm(landmarks, "r_knee", w, h),
        _lm(landmarks, "r_ankle", w, h),
    )
    fd.l_knee_angle = _angle(
        _lm(landmarks, "l_hip", w, h),
        _lm(landmarks, "l_knee", w, h),
        _lm(landmarks, "l_ankle", w, h),
    )

    # Wrist y-positions (normalized — lower y = higher on screen = release)
    rw = landmarks[_LM["r_wrist"]]
    lw = landmarks[_LM["l_wrist"]]
    fd.r_wrist_y = rw.y
    fd.l_wrist_y = lw.y

    # Center of mass (avg of hips)
    rh = landmarks[_LM["r_hip"]]
    lh = landmarks[_LM["l_hip"]]
    fd.com_x = (rh.x + lh.x) / 2
    fd.com_y = (rh.y + lh.y) / 2

    fd.visibility = _vis(
        landmarks,
        "r_shoulder", "l_shoulder",
        "r_elbow", "l_elbow",
        "r_knee", "l_knee",
    )

    return fd


def _detect_jumps(frames: list[FrameData]) -> int:
    """Count jump events: both knees go from bent (<160°) to straight (>165°)."""
    jumps = 0
    in_crouch = False
    for fd in frames:
        avg_knee = (fd.r_knee_angle + fd.l_knee_angle) / 2
        if avg_knee < 155 and fd.visibility > 0.5:
            in_crouch = True
        elif avg_knee > 165 and in_crouch and fd.visibility > 0.5:
            jumps += 1
            in_crouch = False
    return jumps


def _dominant_hand(frames: list[FrameData]) -> str:
    """Which wrist is lower (y is bigger = lower on screen) more often = dribbling hand."""
    r_lower = sum(1 for f in frames if f.r_wrist_y > f.l_wrist_y and f.visibility > 0.4)
    l_lower = sum(1 for f in frames if f.l_wrist_y > f.r_wrist_y and f.visibility > 0.4)
    if r_lower + l_lower == 0:
        return "right"
    if r_lower > l_lower * 1.3:
        return "right"
    if l_lower > r_lower * 1.3:
        return "left"
    return "ambidextrous"


def _drive_direction(frames: list[FrameData]) -> str:
    """Track lateral center-of-mass drift."""
    if len(frames) < 4:
        return "balanced"
    com_x_vals = [f.com_x for f in frames if f.visibility > 0.4]
    if not com_x_vals:
        return "balanced"
    # Compute cumulative lateral drift via sign of consecutive differences
    diffs = [com_x_vals[i + 1] - com_x_vals[i] for i in range(len(com_x_vals) - 1)]
    net = sum(diffs)
    # Positive net = moving right across frame
    if net > 0.08:
        return "right-heavy"
    if net < -0.08:
        return "left-heavy"
    return "balanced"


def _release_height(frames: list[FrameData], jump_count: int) -> str:
    if jump_count == 0:
        return "unknown"
    # During active frames, look at min wrist y (highest point on screen)
    active = [f for f in frames if (f.r_knee_angle + f.l_knee_angle) / 2 > 160 and f.visibility > 0.5]
    if not active:
        return "high"
    min_wrist = min((min(f.r_wrist_y, f.l_wrist_y) for f in active), default=0.3)
    if min_wrist < 0.2:
        return "very high"
    if min_wrist < 0.35:
        return "high"
    if min_wrist < 0.5:
        return "mid"
    return "low"


def _movement_pace(fps: float, frames: list[FrameData]) -> str:
    """Estimate pace from center-of-mass velocity across frames."""
    com_x_vals = [f.com_x for f in frames if f.visibility > 0.4]
    if len(com_x_vals) < 2:
        return "moderate"
    total_dist = sum(abs(com_x_vals[i + 1] - com_x_vals[i]) for i in range(len(com_x_vals) - 1))
    # Normalize by number of transitions
    avg_motion = total_dist / (len(com_x_vals) - 1)
    if avg_motion > 0.012:
        return "fast"
    if avg_motion > 0.005:
        return "moderate"
    return "slow"


def analyze_video(video_path: str) -> VideoMetrics:
    """
    Main entry point. Reads video file, runs MediaPipe Pose on sampled frames,
    returns VideoMetrics dataclass with all findings.
    """
    if not CV_AVAILABLE:
        raise RuntimeError(
            "Computer vision dependencies not installed. "
            "Run: pip install mediapipe opencv-python-headless"
        )

    mp_pose = mp.solutions.pose
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    frame_data: list[FrameData] = []
    frame_idx = 0
    processed = 0
    notes = []

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        smooth_landmarks=True,
        min_detection_confidence=0.45,
        min_tracking_confidence=0.45,
    ) as pose:
        while cap.isOpened() and processed < MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % SAMPLE_RATE == 0:
                h, w = frame.shape[:2]
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb.flags.writeable = False
                results = pose.process(rgb)

                if results.pose_landmarks:
                    fd = _extract_frame(results.pose_landmarks.landmark, w, h)
                    if fd.visibility > 0.3:
                        frame_data.append(fd)
                processed += 1

            frame_idx += 1

    cap.release()

    if not frame_data:
        notes.append("No pose landmarks detected — ensure the video shows a full-body player view.")
        return VideoMetrics(
            frames_analyzed=0,
            total_frames=total_frames,
            fps=fps,
            duration_seconds=round(duration, 1),
            confidence=0.0,
            raw_notes=notes,
        )

    # Aggregate
    good_frames = [f for f in frame_data if f.visibility > 0.5]
    if not good_frames:
        good_frames = frame_data

    avg_r_elbow = sum(f.r_elbow_angle for f in good_frames) / len(good_frames)
    avg_l_elbow = sum(f.l_elbow_angle for f in good_frames) / len(good_frames)
    avg_knee = sum((f.r_knee_angle + f.l_knee_angle) / 2 for f in good_frames) / len(good_frames)
    avg_vis = sum(f.visibility for f in frame_data) / len(frame_data)

    jumps = _detect_jumps(frame_data)
    dom_hand = _dominant_hand(frame_data)
    drive_dir = _drive_direction(frame_data)
    rel_height = _release_height(frame_data, jumps)
    pace = _movement_pace(fps, frame_data)

    # Lateral quickness estimate from pace + drive count
    lateral = "elite" if pace == "fast" and drive_dir != "balanced" else \
              "good" if pace in ("fast", "moderate") else "limited"

    confidence = min(1.0, avg_vis * (len(good_frames) / max(processed, 1)) * 2)

    if confidence < 0.4:
        notes.append("Low confidence — consider a closer camera angle or better-lit footage.")
    if jumps == 0 and duration > 10:
        notes.append("No jump events detected — video may not contain shooting actions.")

    return VideoMetrics(
        dominant_hand=dom_hand,
        drive_direction=drive_dir,
        avg_r_elbow_angle=round(avg_r_elbow, 1),
        avg_l_elbow_angle=round(avg_l_elbow, 1),
        avg_knee_bend=round(avg_knee, 1),
        jump_count=jumps,
        shot_count=max(0, jumps),
        release_height=rel_height,
        movement_pace=pace,
        lateral_quickness=lateral,
        frames_analyzed=len(frame_data),
        total_frames=total_frames,
        fps=round(fps, 1),
        duration_seconds=round(duration, 1),
        confidence=round(confidence, 2),
        raw_notes=notes,
    )


def metrics_to_dict(m: VideoMetrics) -> dict:
    return {
        "dominant_hand":      m.dominant_hand,
        "drive_direction":    m.drive_direction,
        "avg_r_elbow_angle":  m.avg_r_elbow_angle,
        "avg_l_elbow_angle":  m.avg_l_elbow_angle,
        "avg_knee_bend":      m.avg_knee_bend,
        "jump_count":         m.jump_count,
        "shot_count":         m.shot_count,
        "release_height":     m.release_height,
        "movement_pace":      m.movement_pace,
        "lateral_quickness":  m.lateral_quickness,
        "frames_analyzed":    m.frames_analyzed,
        "total_frames":       m.total_frames,
        "fps":                m.fps,
        "duration_seconds":   m.duration_seconds,
        "confidence":         m.confidence,
        "analysis_notes":     m.raw_notes,
    }
