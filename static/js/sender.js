'use strict';

const fileInput = document.getElementById('file-input')
let localConnection, sendChannel, latestOffer, fileMeta
let room_id

// Creating local connection
window.onload = () => {
    try {
        localConnection = new RTCPeerConnection(conf)
    } catch (ReferenceError) {
        alert("Your browser doesn't support WebRTC, please use a different one to be able to use the app.")
        return
    }
    localConnection.onicecandidate = () => {
        latestOffer = localConnection.localDescription
    }
    sendChannel = localConnection.createDataChannel("sendChannel")
    sendChannel.onopen = sendFile
    localConnection.createOffer().then(o => localConnection.setLocalDescription(o))
}

// Toggle send/invite button
function onFileInputChange() {
    if (!sendChannel) return

    if (sendChannel && sendChannel.readyState === 'open') {
        if (fileInput.files.length === 0) return

        sendFile()

    } else {

        put_offer()
    }
}

// SendButton functionality
function sendFile() {
    fileInput.disabled = true
    for (let i = 0; i < fileInput.files.length; i++) {
        let sent = false
        fileMeta = {
            name: fileInput.files[i].name,
            size: fileInput.files[i].size,
            last_modified: fileInput.files[i].lastModified,
        }
        let file = fileInput.files[i]
        console.log("sending file#:", i + 1, "name: ", file.name)
        const fileReader = new FileReader();
        const chunkSize = 256000// 262144
        let so_far = 0
        //send file meta first
        sendChannel.send(JSON.stringify(fileMeta))
        const readChunk = o => {
            const slice = file.slice(o, o + chunkSize)
            fileReader.readAsArrayBuffer(slice)
        }

        readChunk(0)
        // Start sending file
        while (!sent) {

            status.dispatchEvent(
                new CustomEvent('statusChange', {detail: "Connected"})
            )

            progress.style.display = "flex"
            fileReader.onerror = e => {
                console.error('Error reading file: ', e)
                closeConnection()
            }

            // On reading a part of the file, we send that part
            fileReader.onload = sendChunk

            async function sendChunk() {
                await timeout(0.1)
                try {
                    sendChannel.send(fileReader.result)
                } catch (DOMException) {
                    status.dispatchEvent(
                        new CustomEvent('statusChange', {detail: "Connection Error"})
                    )
                    return
                }
                so_far += fileReader.result.byteLength
                progressText.innerText = "Sending " + file.name + " " + (so_far / file.size * 100).toFixed(2).toString() + "% ..."
                progressFill.style.width = (so_far / file.size * 100).toString() + "%"
                if (so_far === file.size) {
                    status.dispatchEvent(
                        new CustomEvent('statusChange', {detail: "Upload Complete!"})
                    )
                    sent = true
                }
                if (so_far < file.size) {
                    // Reads chunkSize bytes of the file
                    readChunk(so_far)
                }
            }

        }
    }
    fileInput.disabled = false
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Puts SDP offer to API
function put_offer() {
    console.log("Putting offer...")
    let xhr = new XMLHttpRequest()
    room_id = Math.floor(Math.random() * (1e10-1) + 1e9)
    let roomLink = document.location.origin + '/api/' + room_id
    xhr.open("PUT", roomLink, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(JSON.stringify(latestOffer.toJSON()))

    inviteLink.textContent = room_id.toString()
    inviteLink.style.color = "black"
    status.dispatchEvent(
        new CustomEvent('statusChange', {detail: "Waiting for receiver to join"})
    )
    console.log("Waiting for answer...")
    get_answer(0)
}

// Gets SDP answer from API
function get_answer(count) {
    if (count >= 1000) {
        alert("Room timed out (receiver didn't join). Please try again.")
        location.reload()
    }
    let xhr = new XMLHttpRequest()
    let room_link = document.location.origin + '/api/' + room_id
    xhr.open("GET", room_link, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send()
    xhr.onreadystatechange = e => {
        if (e.target.readyState === 4) {
            if (xhr.status !== 200) {
                status.dispatchEvent(
                    new CustomEvent('statusChange', {detail: "Connection Error"})
                )
                return
            }
            let rsp = JSON.parse(JSON.parse(xhr.response))
            if (rsp.type === "answer" && localConnection.iceGatheringState === 'complete') {
                status.dispatchEvent(
                    new CustomEvent('statusChange', {detail: "Connecting..."})
                )
                localConnection.setRemoteDescription(rsp)
                    .catch(() => status.dispatchEvent(
                        new CustomEvent('statusChange', {detail: "Connection Error"})
                    ))
            } else if (rsp.type === 'offer') {
                setTimeout(get_answer.bind(null, count + 1), 3000)
            }
        }
    }
}

// Closes Data Channel and local connection
function closeConnection() {
    if (sendChannel) {
        sendChannel.close()
        sendChannel = null
    }
    if (localConnection) {
        localConnection.close()
        localConnection = null
    }
    fileInput.disabled = false
}

window.onbeforeunload = closeConnection
fileInput.onchange = onFileInputChange