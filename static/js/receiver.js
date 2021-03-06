'use strict';

import {
    init,
    getShortFileName,
    formatBytes,
    status,
    conf,
    progress,
    progressFill,
    progressText,
    dragAreaFilled,
    fileText,
    inviteLink,
} from "/static/js/common.js"

const connectButton = document.getElementById('connect-button')
const illustration = document.querySelector('.right-illustration')
let remoteConnection, receiverBuffer = [], bytesReceived = 0, offer, fileMeta, receiveChannel, fileCount = 0

// Connection establishment
window.onload = () => {
    init()
    window.onbeforeunload = closeConnection
    remoteConnection = new RTCPeerConnection(conf)
    remoteConnection.ondatachannel = e => {
        receiveChannel = e.channel
        receiveChannel.binaryType = 'arraybuffer'
        receiveChannel.onopen = () => {
            status.dispatchEvent(
                new CustomEvent('statusChange', {detail: "Connected"})
            )
        }
        receiveChannel.onmessage = e => {
            if (e.data.ice) {
                remoteConnection.addIceCandidate(e.data.ice).then()
            } else if (typeof (e.data) === "string") {
                fileMeta = JSON.parse(e.data)
                illustration.style.display = "none"
                progress.style.display = "flex"
                dragAreaFilled.style.display = "flex"
                fileText.style.display = "flex"
                fileText.firstChild.textContent = getShortFileName(fileMeta.name)
                fileText.children[1].textContent = ` (${formatBytes(fileMeta.size)})`
                fileCount += 1
            } else {
                connectButton.disabled = true
                receiverBuffer.push(e.data)
                bytesReceived += e.data.byteLength
                progressText.innerText = `Downloaded ${formatBytes(bytesReceived)}`
                progressFill.style.width = (bytesReceived / fileMeta.size * 100).toString() + "%"
                receiveChannel.send("ACK")
                if (bytesReceived === fileMeta.size) {
                    status.dispatchEvent(
                        new CustomEvent('statusChange', {detail: `Downloaded ${fileCount} file(s)`})
                    )
                    progressText.innerText = ""
                    progress.style.display = "none"
                    fileText.style.display = "none"
                    dragAreaFilled.style.display = "none"
                    illustration.style.display = "flex"
                    const blob = new Blob(receiverBuffer)
                    let downloadLink = document.createElement('a')
                    downloadLink.href = URL.createObjectURL(blob)
                    downloadLink.download = fileMeta.name
                    downloadLink.click()
                    receiverBuffer = []
                    bytesReceived = 0
                }
            }
        }
        remoteConnection.channel = receiveChannel
    }
    getOffer(document.location.pathname.split('/')[2])
}

// API request to get and parse SDP (offer) from server
function getOffer(roomId) {
    if (roomId === "") return
    console.log("Getting offer...")
    status.dispatchEvent(
        new CustomEvent('statusChange', {detail: "Connecting..."})
    )
    let xhr = new XMLHttpRequest()
    let roomLink = document.location.origin + '/api/' + roomId
    xhr.open("GET", roomLink, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send()
    xhr.onreadystatechange = e => {
        if (e.target.readyState === 4) {
            if (xhr.status === 200) {
                let rsp = JSON.parse(JSON.parse(xhr.response))
                offer = {
                    type: rsp.type,
                    sdp: rsp.sdp
                }
                putAnswer(roomId)
            } else {
                status.dispatchEvent(
                    new CustomEvent('statusChange', {detail: "Connection Error. Retrying..."})
                )
                setTimeout(getOffer, 1000)
            }
        }
    }
}

// API request to put SDP (answer) to server
function putAnswer(roomId) {
    console.log("Putting answer...")
    status.dispatchEvent(
        new CustomEvent('statusChange', {detail: "Connecting"})
    )
    let xhr = new XMLHttpRequest()
    let roomLink = document.location.origin + '/api/' + roomId
    xhr.open("PUT", roomLink, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    remoteConnection.setRemoteDescription(offer)
        .then(() => {
            remoteConnection.createAnswer().then(a => remoteConnection.setLocalDescription(a))
                .then(() => xhr.send(JSON.stringify(remoteConnection.localDescription)))
                .catch(() => status.dispatchEvent(
                    new CustomEvent('statusChange', {detail: "Connection Error. Please try again"})
                ))
        })
        .catch(() => status.dispatchEvent(
            new CustomEvent('statusChange', {detail: "Connection Error. Please try again"})
        ))
}

// Pressing enter to connect
inviteLink.addEventListener("keyup", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        connectButton.click();
    }
})

// Join room
connectButton.onclick = () => {
    if (inviteLink.value === '') {
        alert("Please enter a room id/link")
    } else {
        let room = inviteLink.value
        if (Number.isInteger(parseInt(room))) {
            getOffer(room)
        } else if (Number.isInteger(parseInt(room.split('/').slice(-1)[0]))) {
            getOffer(room.split('/').slice(-1)[0])
        } else {
            alert("Invalid invitation link or room id.")
        }
    }
}

// Closes Data Channel and remote connection
function closeConnection() {
    if (receiveChannel) {
        receiveChannel.close()
        receiveChannel = null
    }
    if (remoteConnection) {
        remoteConnection.close()
        remoteConnection = null
    }
}

