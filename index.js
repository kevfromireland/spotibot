'use strict';

const secrets = require('./secrets.js');

const { WebClient } = require('@slack/web-api');
const _ = require('lodash');
const spotifyTrackIdExtractor = require('./spotifyTrackIdExtractor.js');
const SpotifyWebApi = require('spotify-web-api-node');


async function getSpotifyClient() {
    const spotifyApi = new SpotifyWebApi(secrets.spotifyClientCredentials);
    spotifyApi.setRefreshToken(secrets.spotifyRefreshToken);
    
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);

    return spotifyApi;
}

function getSlackClient() {
    const slackClient = new WebClient(secrets.slackBotOauthAccessToken);

    return slackClient;
}

async function getAllSpotifyTracksFromSlack(slackClient, channelId) {
    let tracks = [];

    for await (const page of slackClient.paginate('conversations.history', { channel: channelId })) {
        const theseTracks = _.flatten(page.messages.map(message =>
            spotifyTrackIdExtractor.extractTrackIds(message.text).map(trackId => ({
                trackId: trackId,
                timestamp: message.ts
            }))
        ));
        tracks.push(...theseTracks);
    }

    return tracks;
}

async function getSpotifyTracksInPlaylist(spotifyApi, playlistId) {
    const playlistTracks = await spotifyApi.getPlaylistTracks(playlistId, {
        fields: 'items'
    });

    return playlistTracks.body.items;
}

async function putSpotifyTracksIntoPlaylist(spotifyApi, tracksToAdd, playlistId) {
    const currentTracks = await getSpotifyTracksInPlaylist(spotifyApi, playlistId);

    const currentTrackIds = currentTracks.map(x => x.track.id);
    const trackIdsBeingAdded = tracksToAdd.map(x => x.trackId);

    const newTracksToAdd = _.difference(trackIdsBeingAdded, currentTrackIds);

    if (newTracksToAdd.length === 0) {
        return 0;
    }

    await spotifyApi.addTracksToPlaylist(playlistId, newTracksToAdd.map(x => 'spotify:track:' + x));
    return newTracksToAdd.length;
}

(async () => {

    try {
        const slackApi = getSlackClient();
        const tracks = await getAllSpotifyTracksFromSlack(slackApi, secrets.spotifyChannelName);

        const spotifyApi = await getSpotifyClient();
        const tracksAdded = await putSpotifyTracksIntoPlaylist(spotifyApi, tracks, '4VgNNTXhy73ZCvqT2MthV5');

        console.log('Success! Added ' + tracksAdded + ' tracks');

    } catch (error) {
        console.log(error);
    }

})();

