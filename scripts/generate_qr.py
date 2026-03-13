import qrcode
import os

# Define the network URL
url = "http://10.254.28.27:5173"

# Create QR code
qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,
    border=4,
)
qr.add_data(url)
qr.make(fit=True)

# Generate image
img = qr.make_image(fill_color="black", back_color="white")

# Save image
output_path = "/Users/sureshkumar/prime project/tnimpact/public/mobile_qr.png"
img.save(output_path)

print(f"QR Code generated successfully at {output_path}")
print(f"URL: {url}")
