# Install Linux packages

Snapcast packages are available for several Linux distributions:

- [Debian](#debian)


## Debian

For Debian (and Debian-based systems, such as Ubuntu, Linux Mint, ElementaryOS) download the package for your CPU architecture from the [latest release page](https://github.com/badaix/snapcast/releases/latest).

e.g. for Raspberry Pi `snapclient_0.x.x_armhf.deb`, for laptops `snapclient_0.x.x_amd64.deb`

### using apt 1.1 or later

    sudo apt install </path/to/snapclient_0.x.x_[arch].deb>

or

    sudo apt install </path/to/snapserver_0.x.x_[arch].deb>

### using dpkg

Install the package:

    sudo dpkg -i </path/to/snapclient_0.x.x_[arch].deb>

or

    sudo dpkg -i </path/to/snapserver_0.x.x_[arch].deb>

Install missing dependencies:

    sudo apt-get -f install
