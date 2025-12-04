#!/usr/bin/env python3
"""
Generate black PNG images of any specified size.

Usage:
    python generate_black_png.py width height output.png
    python generate_black_png.py 1920 1080 black_image.png

Arguments:
    width     Image width in pixels
    height    Image height in pixels
    output    Output filename (must end with .png)

Example:
    python generate_black_png.py 1920 1080 wallpaper.png
"""

import sys
import argparse
from PIL import Image

def create_black_png(width, height, output_path):
    """Create a completely black PNG image with specified dimensions."""
    try:
        # Create a new black image in RGB mode
        black_image = Image.new('RGB', (width, height), (0, 0, 0))

        # Save the image as PNG
        black_image.save(output_path, 'PNG')

        print(f"✓ Successfully created {output_path} ({width}x{height})")

    except Exception as e:
        print(f"✗ Error creating image: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description='Generate a completely black PNG image with specified dimensions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument('width', type=int, help='Image width in pixels')
    parser.add_argument('height', type=int, help='Image height in pixels')
    parser.add_argument('output', help='Output filename (must end with .png)')

    args = parser.parse_args()

    # Validate inputs
    if args.width <= 0 or args.height <= 0:
        print("✗ Error: Width and height must be positive integers")
        sys.exit(1)

    if not args.output.lower().endswith('.png'):
        print("✗ Error: Output file must have .png extension")
        sys.exit(1)

    # Create the black PNG
    create_black_png(args.width, args.height, args.output)

if __name__ == '__main__':
    main()