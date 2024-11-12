from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/traduccion', methods=['POST'])
def traduccion():
    data = request.get_json()
    valor = data.get('text')

    url = 'https://magicloops.dev/api/loop/run/e86ed0fb-1069-4216-859f-93689c6cbdc0'
    payload = {"text": valor}

    response = requests.get(url, json=payload)
    responseJson = response.json()

    if 'loopOutput' in responseJson and isinstance(responseJson['loopOutput'], dict):
        loop_output = responseJson['loopOutput']
        translated_text = loop_output.get('translatedText', 'No translatedText found')
        return jsonify({"translatedText": translated_text})
    else:
        return jsonify({"error": "Invalid response from translation API"}), 400

if __name__ == '__main__':
    app.run(debug=True)