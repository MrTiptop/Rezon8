/***
    This file is part of snapcast
    Copyright (C) 2014-2021  Johannes Pohl

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
***/

#define CATCH_CONFIG_MAIN
#include "catch.hpp"
#include "common/aixlog.hpp"
#include "common/utils/string_utils.hpp"
#include "server/streamreader/stream_uri.hpp"

using namespace std;


TEST_CASE("String utils")
{
    using namespace utils::string;
    REQUIRE(ltrim_copy(" test") == "test");
}


TEST_CASE("Uri")
{
    AixLog::Log::init<AixLog::SinkCout>(AixLog::Severity::debug);
    using namespace streamreader;
    StreamUri uri("pipe:///tmp/snapfifo?name=default&codec=flac");
    REQUIRE(uri.scheme == "pipe"); 
    REQUIRE(uri.path == "/tmp/snapfifo"); 
    REQUIRE(uri.host.empty());

    // uri = StreamUri("scheme:[//host[:port]][/]path[?query=none][#fragment]");
    // Test with all fields
    uri = StreamUri("scheme://host:port/path?query=none&key=value#fragment");
    REQUIRE(uri.scheme == "scheme"); 
    REQUIRE(uri.host == "host:port"); 
    REQUIRE(uri.path == "/path");
    REQUIRE(uri.query["query"] == "none");
    REQUIRE(uri.query["key"] == "value");
    REQUIRE(uri.fragment == "fragment");

    // Test with all fields, url encoded
    // "%21%23%24%25%26%27%28%29%2A%2B%2C%2F%3A%3B%3D%3F%40%5B%5D"
    // "!#$%&'()*+,/:;=?@[]"
    uri = StreamUri("scheme%26://%26host%3f:port/pa%2Bth?%21%23%24%25%26%27%28%29=%2A%2B%2C%2F%3A%3B%3D%3F%40%5B%5D&key%2525=value#fragment%3f%21%3F");
    REQUIRE(uri.scheme == "scheme&"); 
    REQUIRE(uri.host == "&host?:port"); 
    REQUIRE(uri.path == "/pa+th");
    REQUIRE(uri.query["!#$%&'()"] == "*+,/:;=?@[]");
    REQUIRE(uri.query["key%25"] == "value");
    REQUIRE(uri.fragment == "fragment?!?");

    // No host
    uri = StreamUri("scheme:///path?query=none#fragment");
    REQUIRE(uri.scheme == "scheme"); 
    REQUIRE(uri.path == "/path");
    REQUIRE(uri.query["query"] == "none");
    REQUIRE(uri.fragment == "fragment");

    // No host, no query
    uri = StreamUri("scheme:///path#fragment");
    REQUIRE(uri.scheme == "scheme"); 
    REQUIRE(uri.path == "/path");
    REQUIRE(uri.query.empty());
    REQUIRE(uri.fragment == "fragment");

    // No host, no fragment
    uri = StreamUri("scheme:///path?query=none");
    REQUIRE(uri.scheme == "scheme"); 
    REQUIRE(uri.path == "/path");
    REQUIRE(uri.query["query"] == "none");
    REQUIRE(uri.fragment.empty());

    // just schema and path
    uri = StreamUri("scheme:///path");
    REQUIRE(uri.scheme == "scheme"); 
    REQUIRE(uri.path == "/path");
    REQUIRE(uri.query.empty());
    REQUIRE(uri.fragment.empty());

    // Issue #850
    uri = StreamUri("spotify:///librespot?name=Spotify&username=EMAIL&password=string%26with%26ampersands&devicename=Snapcast&bitrate=320&killall=false");
    REQUIRE(uri.scheme == "spotify"); 
    REQUIRE(uri.host.empty()); 
    REQUIRE(uri.path == "/librespot");
    REQUIRE(uri.query["name"] == "Spotify");
    REQUIRE(uri.query["username"] == "EMAIL");
    REQUIRE(uri.query["password"] == "string&with&ampersands");
    REQUIRE(uri.query["devicename"] == "Snapcast");
    REQUIRE(uri.query["bitrate"] == "320");
    REQUIRE(uri.query["killall"] == "false");
}
